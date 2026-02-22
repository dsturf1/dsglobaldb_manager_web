import simplejson as json
import boto3
from decimal import Decimal

# S3 클라이언트 초기화
s3 = boto3.client('s3')
s3_Bucket = 'dsbaseinfo'


def save_json_by_key_to_s3(data_dict, common_keys, bucket_name):

    results = []

    for key, value in data_dict.items():
        # 저장 제외 조건
        if key in ["mapdscourseid", "dsmapcourseid","user","User","users"]:
            print(f"⚠️ Skipping key: {key}")
            continue

        s3_key = f"common/{key}.json" if key in common_keys else f"outrecord/{key}.json"

        try:
            s3.put_object(
                Bucket=bucket_name,
                Key=s3_key,
                Body=json.dumps(value, ensure_ascii=False, indent=2).encode('utf-8')
            )
            msg = f"✅ Saved {key} to s3://{bucket_name}/{s3_key}"
            print(msg)
            results.append(msg)
        except Exception as e:
            err = f"❌ Error saving {key} to S3: {e}"
            print(err)
            results.append(err)

    return results

def load_all_json_from_prefix(bucket_name: str, prefix: str):
    s3 = boto3.client('s3')
    result_dict = {}

    # 1. prefix 경로 아래의 모든 객체 리스트 가져오기
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)

    if 'Contents' not in response:
        print("No files found.")
        return result_dict

    for obj in response['Contents']:
        key = obj['Key']
        if key.endswith('.json'):
            try:
                content_object = s3.get_object(Bucket=bucket_name, Key=key)
                file_content = content_object['Body'].read().decode('utf-8')
                json_data = json.loads(file_content)

                # 파일명에서 .json 제거하고 딕셔너리 key로 사용
                filename = key.split('/')[-1].replace('.json', '')
                result_dict[filename] = json_data

            except Exception as e:
                print(f"Error reading {key}: {e}")

    return result_dict

# Lambda 핸들러
def lambda_handler(event, context):
    method = event['context']['http-method']

    if method == "GET":
        return get_data(event)
    elif method == "PUT":
        return replace_data(event)
    elif method == "POST":
        return replace_data(event)
    elif method == "DELETE":
        return delete_data(event)

    return {
        "statusCode": 405,
        "body": json.dumps({"error": "Method Not Allowed"}),
        "headers": {"Content-Type": "application/json"}
    }


def get_data(event):
    query_params = event.get('params', {}).get('querystring', {})
    mapdscourseid = query_params.get('mapdscourseid')

    # common/ + outrecord/ 전체 로드 (DSWorkBaseInfo, DSGEOBaseInfo와 동일 패턴)
    outrecord = load_all_json_from_prefix('dsbaseinfo', 'outrecord/')
    common = load_all_json_from_prefix('dsbaseinfo', 'common/')
    json_content = {**common, **outrecord}

    if not json_content:
        return {
            "statusCode": 500,
            "body": json.dumps({"message": "Failed to load base info"}, ensure_ascii=False),
            "headers": {"Content-Type": "application/json"}
        }

    # mapcourse_info는 common/에서 이미 로드됨
    mapcourse_info = json_content.get("mapcourse_info", [])
    matched_item = next((item for item in mapcourse_info if str(item.get('id')) == str(mapdscourseid)), None)

    # dstask 내부 courseNames 업데이트
    if matched_item and "dstask" in json_content and isinstance(json_content["dstask"], list):
        new_course_names = matched_item.get("course_names", [])
        for task in json_content["dstask"]:
            task["courseNames"] = new_course_names

    return {
        "statusCode": 200,
        "body": json_content,
        "headers": {"Content-Type": "application/json"}
    }

def replace_data(event):
    try:
        new_data = json.loads(json.dumps(event["body-json"]).encode('UTF-8'), parse_float=Decimal)

        try:
            response = save_json_by_key_to_s3(event["body-json"], ['dsOrgList', 'dsworkcourse_info', 'mapcourse_info'], 'dsbaseinfo')
            return {
                "statusCode": 200,
                "body": json.dumps({"message": "Data replaced successfully"}),
                "response": response
            }
        except Exception as e:
            return {
                "statusCode": 500,
                "body": json.dumps({"message": f"Error replacing data: {str(e)}"})
            }
    except Exception as e:
        return {
            "statusCode": 400,
            "body": json.dumps({"message": f"Invalid request body: {str(e)}"})
        }
