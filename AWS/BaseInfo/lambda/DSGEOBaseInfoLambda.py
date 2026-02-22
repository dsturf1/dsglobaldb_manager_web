import json
import boto3
from datetime import datetime

s3 = boto3.client('s3')

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

def save_json_by_key_to_s3(data_dict, common_keys, bucket_name):

    results = []

    for key, value in data_dict.items():
        # 저장 제외 조건
        if key in ["mapdscourseid", "dsmapcourseid","user","User","users"]:
            print(f"⚠️ Skipping key: {key}")
            continue

        s3_key = f"common/{key}.json" if key in common_keys else f"geo/{key}.json"

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



def lambda_handler(event, context):
    
    user = event['params']['querystring'].get('user')
    
    
    if event['context']['http-method'] == 'GET':
    # TODO implement

        if user !='dsgeoadmin' :

    
            content_object = s3.get_object(Bucket = 'dsgeousergrp', Key = user+'/base.json')
            file_content = content_object['Body'].read().decode('utf-8')
            response = json.loads(file_content)
        else:

            common = load_all_json_from_prefix('dsbaseinfo','common/')
            geo = load_all_json_from_prefix('dsbaseinfo','geo/')
            response = {**common, **geo}


        
    elif event['context']['http-method'] == 'POST':
        if user !='dsgeoadmin' :
            now = datetime.now()
            
            copy_source = {
                'Bucket': 'dsgeousergrp',
                'Key': user+'/base.json'
            }
            boto3.resource('s3').meta.client.copy(copy_source, 'dsgeousergrp', user+'/base{}.json'.format(now))
            response = s3.put_object(Body=json.dumps(event["body-json"]).encode('UTF-8'), Bucket = 'dsgeousergrp', Key = user+'/base.json')
        else:
            response = save_json_by_key_to_s3(event["body-json"], ['dsOrgList', 'dsworkcourse_info', 'mapcourse_info'], 'dsbaseinfo')
        # response = save_json_by_key_to_s3(event["body-json"], [], 'dsbaseinfo')
    else:
        response = "문제가 있는데...."
    
    return {
        'statusCode': 200,
        'body': response
        # 'body': json.dumps(event)
    }
