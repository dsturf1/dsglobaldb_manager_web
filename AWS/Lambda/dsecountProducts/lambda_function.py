import json
import boto3
from botocore.exceptions import ClientError

# 이카운트 품목 요약 파일 (AWS/Ecount/fetch_products.py 가 업로드)
# API: GET /ecountproducts  (API Gateway jyipsj28s9, 패스스루 매핑 템플릿)
s3 = boto3.client('s3')
s3_Bucket = 'dsbaseinfo'
s3_Key = 'ecount/products_latest.json'


def lambda_handler(event, context):
    method = event['context']['http-method']
    if method == "GET":
        return get_products()
    return {
        "statusCode": 405,
        "body": json.dumps({"message": "Method not allowed"})
    }


def get_products():
    try:
        content_object = s3.get_object(Bucket=s3_Bucket, Key=s3_Key)
        body = content_object['Body'].read().decode('utf-8')
        return {
            "statusCode": 200,
            "body": body
        }
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            return {
                "statusCode": 404,
                "body": json.dumps({"message": "이카운트 품목 파일이 없습니다. AWS/Ecount/fetch_products.py 를 먼저 실행하세요."}, ensure_ascii=False)
            }
        return {
            "statusCode": 500,
            "body": json.dumps({"message": str(e)}, ensure_ascii=False)
        }
