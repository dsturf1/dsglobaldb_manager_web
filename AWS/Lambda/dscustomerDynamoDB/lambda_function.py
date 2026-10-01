import json
import boto3
from decimal import Decimal

# 거래처 (이카운트 거래처등록 ESA001M 중 '거래처코드동일')
# API: /dscustomer  (API Gateway jyipsj28s9, 패스스루 매핑 템플릿)
#   GET                 전체 목록
#   POST / PUT          한 건(object) 또는 여러 건(list) 추가/수정 (put_item, 전체 덮어쓰기)
#   DELETE ?id={custcd} 삭제
dynamodb = boto3.resource('dynamodb')
table_name = "dscustomers"
table = dynamodb.Table(table_name)


def lambda_handler(event, context):
    method = event['context']['http-method']
    if method == "GET":
        return get_customers(event)
    elif method in ("POST", "PUT"):
        return put_customers(event)
    elif method == "DELETE":
        return delete_customer(event)
    return {
        "statusCode": 405,
        "body": json.dumps({"message": "Method not allowed"})
    }


def get_customers(event):
    try:
        response = table.scan()
        data_ = response.get('Items', [])
        while 'LastEvaluatedKey' in response:
            response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            data_.extend(response.get('Items', []))
        return {
            "statusCode": 200,
            "body": json.dumps(data_, default=decimal_default, ensure_ascii=False)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"message": str(e)}, ensure_ascii=False)
        }


def put_customers(event):
    try:
        res_json = json.loads(json.dumps(event["body-json"]), parse_float=Decimal)
        items = res_json if isinstance(res_json, list) else [res_json]
        if any(not item.get('custcd') for item in items):
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "custcd 가 없는 항목이 있습니다"}, ensure_ascii=False)
            }

        if len(items) == 1:
            table.put_item(Item=items[0])
        else:
            with table.batch_writer(overwrite_by_pkeys=['custcd']) as batch:
                for item in items:
                    batch.put_item(Item=item)

        return {
            "statusCode": 201,
            "body": json.dumps({"message": f"{len(items)} customer(s) added or modified"})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"message": f"Error: {str(e)}"}, ensure_ascii=False)
        }


def delete_customer(event):
    try:
        _id = event['params']['querystring'].get('id')
        if not _id:
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "Missing 'id' parameter"})
            }
        table.delete_item(Key={'custcd': _id})
        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"Customer '{_id}' deleted"}, ensure_ascii=False)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"message": str(e)}, ensure_ascii=False)
        }


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    raise TypeError
