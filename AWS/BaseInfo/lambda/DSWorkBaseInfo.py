import json
import boto3
from datetime import datetime

s3 = boto3.client('s3')


def save_json_by_key_to_s3(data_dict, common_keys, bucket_name):

    results = []

    for key, value in data_dict.items():
        # 저장 제외 조건
        if key in ["mapdscourseid", "dsmapcourseid","user","User","users"]:
            print(f"⚠️ Skipping key: {key}")
            continue

        s3_key = f"common/{key}.json" if key in common_keys else f"work/{key}.json"

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
    
    flg = event['params']['querystring'].get('flg', None)
    outflg = event['params']['querystring'].get('outflg', None)

    json_content = load_all_json_from_prefix('dsbaseinfo','work/')
    common = load_all_json_from_prefix('dsbaseinfo','common/')
    json_content =  {**common, **json_content}
    
    # if method == 'GET':
        # TODO implement
        # content_object = s3.get_object(Bucket = 'dsworkbase', Key = 'baseinfo/base.json')
        # file_content = content_object['Body'].read().decode('utf-8')
        # json_content = json.loads(file_content)

    # content_object = s3.get_object(Bucket = 'dsworkbase', Key = 'baseinfo/base_total.json')
    # file_content = content_object['Body'].read().decode('utf-8')
    # json_content = json.loads(file_content)
    
    # if flg == 'Y':
    #     json_content['chemical_info']= [x for x in json_content['all_chemical_info'] if x['flgWork'] =='Y']
    #     json_content['course_info']= [x for x in json_content['dsworkcourse_info'] if x['active'] =='Y']
        
    # if outflg == 'Y':
    #     json_content['chemical_info']= [x for x in json_content['all_chemical_info'] if x['flgOut'] =='Y']
    #     json_content['course_info']= [x for x in json_content['dsworkcourse_info'] if x['active'] =='Y']


    return {
        'statusCode': 200,
        'body': json_content
        # 'body': json.dumps(event)
    }
        
def replace_data(event):
        
    # elif method == 'POST':
    
    now = datetime.now()
    copy_source = {
        'Bucket': 'dsworkbase',
        'Key': 'baseinfo/base_total.json'
        }
    boto3.resource('s3').meta.client.copy(copy_source, 'dsworkbase', 'baseinfo/base_total{}.json'.format(now))
        
        # bucket = s3.Bucket('dsworkbaseinfo')
        # bucket.copy(copy_source, 'baseinfo/base{}.json'.format(now))    
    
    
    json_content = s3.put_object(Body=json.dumps(event['body-json']).encode('UTF-8'),Bucket = 'dsworkbase', Key = 'baseinfo/base_total.json')
    json_content = save_json_by_key_to_s3(event["body-json"], ['dsOrgList', 'dsworkcourse_info', 'mapcourse_info'], 'dsbaseinfo')
    
    return {
        'statusCode': 200,
        'body': json_content
        # 'body': json.dumps(event)
    }
