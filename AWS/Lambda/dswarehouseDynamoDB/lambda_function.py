import json
import boto3
from decimal import Decimal

# 창고 (이카운트 창고등록 ESA005M)
# API: /dswarehouse  (API Gateway jyipsj28s9, 패스스루 매핑 템플릿)
#   GET                 전체 목록
#   POST / PUT          한 건(object) 또는 여러 건(list) 저장 (put_item, 전체 덮어쓰기 — 웹의 엑셀 비교 반영용)
#   DELETE ?id={whcd}   삭제
# 새로 추가는 POST /dswarehouse/create (Lambda dsglobaldbCreate, 덮어쓰기 없음)
dynamodb = boto3.resource('dynamodb')
table_name = "dswarehouses"
table = dynamodb.Table(table_name)


def lambda_handler(event, context):
    method = event['context']['http-method']
    if method == "GET":
        return get_warehouses(event)
    elif method in ("POST", "PUT"):
        return put_warehouses(event)
    elif method == "DELETE":
        return delete_warehouse(event)
    return {
        "statusCode": 405,
        "body": json.dumps({"message": "Method not allowed"})
    }


def get_warehouses(event):
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


def put_warehouses(event):
    try:
        res_json = json.loads(json.dumps(event["body-json"]), parse_float=Decimal)
        items = res_json if isinstance(res_json, list) else [res_json]
        if any(not item.get('whcd') for item in items):
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "whcd 가 없는 항목이 있습니다"}, ensure_ascii=False)
            }

        if len(items) == 1:
            table.put_item(Item=items[0])
        else:
            with table.batch_writer(overwrite_by_pkeys=['whcd']) as batch:
                for item in items:
                    batch.put_item(Item=item)

        return {
            "statusCode": 201,
            "body": json.dumps({"message": f"{len(items)} warehouse(s) added or modified"})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"message": f"Error: {str(e)}"}, ensure_ascii=False)
        }


def delete_warehouse(event):
    try:
        _id = event['params']['querystring'].get('id')
        if not _id:
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "Missing 'id' parameter"})
            }
        table.delete_item(Key={'whcd': _id})
        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"Warehouse '{_id}' deleted"}, ensure_ascii=False)
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
