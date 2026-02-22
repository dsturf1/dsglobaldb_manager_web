import simplejson as json
import boto3
from decimal import Decimal

# S3 클라이언트 초기화
s3 = boto3.client('s3')
# s3_Bucket = 'dsoutrecord'
s3_Bucket = 'dsbaseinfo'

s3_file4 = 'mapcourse_info.json'
# s3_file_total = 'dsbase_total.json'

def get_json_from_s3(bucket, key):
    """S3에서 JSON 파일을 가져와 파싱"""
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        content = response["Body"].read().decode("utf-8")
        return json.loads(content)
    except s3.exceptions.NoSuchKey:
        print(f"Error: {key} not found in S3")
        return None
    except Exception as e:
        print(f"Error fetching {key} from S3:", str(e))
        return None

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

    # S3 경로 구성
    # key_path_common = f"public/base/MGC999/{s3_file_total}"
    key_path_course = f"common/{s3_file4}"
    key_path_common = f"common/dsOrgList.json"

    # 공통 JSON (json_common)
    # json_common = get_json_from_s3(s3_Bucket, key_path_common)
    json_common = load_all_json_from_prefix('dsbaseinfo','outrecord/')
    json_common2 = get_json_from_s3(s3_Bucket, key_path_common)
    json_common = {**json_common, "dsOrgList":json_common2}
    if json_common is None:
        return {
            "statusCode": 500,
            "body": json.dumps({"message": f"Failed to load: {key_path_common}"}, ensure_ascii=False),
            "headers": {"Content-Type": "application/json"}
        }

    # course 메타 정보 로딩
    try:
        content_object = s3.get_object(Bucket=s3_Bucket, Key=key_path_course)
        file_content = content_object['Body'].read().decode('utf-8')
        json_content = json.loads(file_content)
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"message": f"Error loading {key_path_course}: {str(e)}"}, ensure_ascii=False),
            "headers": {"Content-Type": "application/json"}
        }

    # matched_item 찾기
    matched_item = next((item for item in json_content if str(item.get('id')) == str(mapdscourseid)), None)

    # ✅ dstask 내부 courseNames 업데이트
    if matched_item and "dstask" in json_common and isinstance(json_common["dstask"], list):
        new_course_names = matched_item.get("course_names", [])
        for task in json_common["dstask"]:
            task["courseNames"] = new_course_names

    # 최종 반환: 수정된 json_common만!
    return {
        "statusCode": 200,
        "body": json_common,
        "headers": {"Content-Type": "application/json"}
    }

def replace_data(event):
    try:
        new_data = json.loads(json.dumps(event["body-json"]).encode('UTF-8'), parse_float=Decimal)

        # key_path = f"public/base/MGC999/{s3_file_total}"

        try:
            # s3.put_object(
            #     Bucket=s3_Bucket,
            #     Key=key_path,
            #     Body=json.dumps(new_data, use_decimal=True),
            #     ContentType='application/json'
            # )
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
