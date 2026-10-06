"""Lambda + API Gateway(REST, non-proxy) 배포 도우미.

기존 API(jyipsj28s9 등)와 같은 구성으로 만든다:
인증 없음, 기존 리소스에서 복사한 패스스루 매핑 템플릿, CORS(*), OPTIONS MOCK.
노트북에서 truststore.inject_into_ssl() 후 boto3 기본 세션을 설정하고 import 한다.
"""
import io
import json
import time
import urllib.error
import urllib.request
import zipfile

import boto3

REGION = 'us-east-1'


def deploy_lambda(function_name, source_file, role_arn, description='', timeout=10, memory=128):
    """Lambda 생성 또는 코드 갱신. FunctionArn 반환."""
    lam = boto3.client('lambda')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(source_file, 'lambda_function.py')
    zip_bytes = buf.getvalue()

    try:
        lam.get_function(FunctionName=function_name)
        lam.update_function_code(FunctionName=function_name, ZipFile=zip_bytes)
        print('코드 갱신:', function_name)
    except lam.exceptions.ResourceNotFoundException:
        lam.create_function(
            FunctionName=function_name, Runtime='python3.13', Role=role_arn,
            Handler='lambda_function.lambda_handler', Code={'ZipFile': zip_bytes},
            Timeout=timeout, MemorySize=memory, Description=description,
        )
        print('생성:', function_name)

    lam.get_waiter('function_active_v2').wait(FunctionName=function_name)
    lam.get_waiter('function_updated_v2').wait(FunctionName=function_name)
    return lam.get_function(FunctionName=function_name)['Configuration']['FunctionArn']


def ensure_resource(api_id, path_part):
    """루트 아래 /{path_part} 리소스 id 반환 (없으면 생성)."""
    apigw = boto3.client('apigateway')
    resources = {r['path']: r for r in apigw.get_resources(restApiId=api_id, limit=500)['items']}
    if f'/{path_part}' in resources:
        print('리소스 있음:', f'/{path_part}')
        return resources[f'/{path_part}']['id']
    print('리소스 생성:', f'/{path_part}')
    return apigw.create_resource(restApiId=api_id, parentId=resources['/']['id'], pathPart=path_part)['id']


def ensure_resource_path(api_id, path):
    """'/dschemical/create' 처럼 여러 단계 경로의 리소스 id 반환 (없는 단계는 생성)."""
    apigw = boto3.client('apigateway')
    resources = {r['path']: r['id'] for r in apigw.get_resources(restApiId=api_id, limit=500)['items']}
    current = ''
    for part in path.strip('/').split('/'):
        parent_id = resources['/' if current == '' else current]
        current = f'{current}/{part}'
        if current not in resources:
            resources[current] = apigw.create_resource(restApiId=api_id, parentId=parent_id, pathPart=part)['id']
            print('리소스 생성:', current)
    return resources[current]


def get_request_template(api_id, template_from, http_method='GET'):
    """기존 리소스의 패스스루 매핑 템플릿."""
    apigw = boto3.client('apigateway')
    resources = {r['path']: r for r in apigw.get_resources(restApiId=api_id, limit=500)['items']}
    integration = apigw.get_method(restApiId=api_id, resourceId=resources[template_from]['id'],
                                   httpMethod=http_method)['methodIntegration']
    return integration['requestTemplates']['application/json']


def _put_method_fresh(api_id, resource_id, http_method, api_key_required=False):
    apigw = boto3.client('apigateway')
    try:
        apigw.delete_method(restApiId=api_id, resourceId=resource_id, httpMethod=http_method)
    except apigw.exceptions.NotFoundException:
        pass
    apigw.put_method(restApiId=api_id, resourceId=resource_id, httpMethod=http_method, authorizationType='NONE',
                     apiKeyRequired=api_key_required)


def setup_lambda_method(api_id, resource_id, http_method, function_arn, request_template, api_key_required=False):
    """메서드 → Lambda (non-proxy) + CORS 응답 헤더. api_key_required 면 x-api-key 헤더 필요 (사용량 계획 키)."""
    apigw = boto3.client('apigateway')
    _put_method_fresh(api_id, resource_id, http_method, api_key_required)
    apigw.put_integration(
        restApiId=api_id, resourceId=resource_id, httpMethod=http_method,
        type='AWS', integrationHttpMethod='POST',
        uri=f'arn:aws:apigateway:{REGION}:lambda:path/2015-03-31/functions/{function_arn}/invocations',
        requestTemplates={'application/json': request_template},
        passthroughBehavior='WHEN_NO_MATCH', contentHandling='CONVERT_TO_TEXT',
    )
    apigw.put_method_response(
        restApiId=api_id, resourceId=resource_id, httpMethod=http_method, statusCode='200',
        responseParameters={'method.response.header.Access-Control-Allow-Origin': False},
        responseModels={'application/json': 'Empty'},
    )
    apigw.put_integration_response(
        restApiId=api_id, resourceId=resource_id, httpMethod=http_method, statusCode='200',
        responseParameters={'method.response.header.Access-Control-Allow-Origin': "'*'"},
    )
    print(f'{http_method} 설정 완료')


def setup_options(api_id, resource_id, methods):
    """CORS preflight (MOCK)."""
    apigw = boto3.client('apigateway')
    _put_method_fresh(api_id, resource_id, 'OPTIONS')
    apigw.put_integration(
        restApiId=api_id, resourceId=resource_id, httpMethod='OPTIONS', type='MOCK',
        requestTemplates={'application/json': '{"statusCode": 200}'}, passthroughBehavior='WHEN_NO_MATCH',
    )
    cors_headers = {
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'method.response.header.Access-Control-Allow-Methods': "'" + ','.join(sorted(set(methods) | {'OPTIONS'})) + "'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
    }
    apigw.put_method_response(
        restApiId=api_id, resourceId=resource_id, httpMethod='OPTIONS', statusCode='200',
        responseParameters={k: False for k in cors_headers}, responseModels={'application/json': 'Empty'},
    )
    apigw.put_integration_response(
        restApiId=api_id, resourceId=resource_id, httpMethod='OPTIONS', statusCode='200',
        responseParameters=cors_headers,
    )
    print('OPTIONS 설정 완료')


def ensure_api_keys(api_id, stage, plan_name, key_names, rate=10, burst=20):
    """사용량 계획(스테이지 연결)과 앱별 API 키를 만들고 {이름: 키 값} 반환. 키 값은 출력하지 않는다."""
    apigw = boto3.client('apigateway')
    plan = next((p for p in apigw.get_usage_plans(limit=500)['items'] if p['name'] == plan_name), None)
    if plan is None:
        plan = apigw.create_usage_plan(name=plan_name, description='글로벌 DB 쓰기 API (update/alias)',
                                       apiStages=[{'apiId': api_id, 'stage': stage}],
                                       throttle={'rateLimit': rate, 'burstLimit': burst})
        print('사용량 계획 생성:', plan_name)
    else:
        print('사용량 계획 있음:', plan_name)
    attached = {k['name'] for k in apigw.get_usage_plan_keys(usagePlanId=plan['id'], limit=500)['items']}
    existing = {k['name']: k for k in apigw.get_api_keys(includeValues=True, limit=500)['items']}
    values = {}
    for name in key_names:
        key = existing.get(name) or apigw.create_api_key(name=name, enabled=True, description=f'{plan_name}: {name}')
        if name not in attached:
            apigw.create_usage_plan_key(usagePlanId=plan['id'], keyId=key['id'], keyType='API_KEY')
        values[name] = key.get('value') or apigw.get_api_key(apiKey=key['id'], includeValue=True)['value']
        print('API 키:', name, '(값은 출력하지 않음)')
    return values


def grant_invoke(function_name, api_id, account_id, path_part):
    """API Gateway 가 이 경로의 모든 메서드로 Lambda 를 호출할 권한. path_part 는 'dschemical/create' 처럼 여러 단계 가능."""
    lam = boto3.client('lambda')
    try:
        lam.add_permission(
            FunctionName=function_name, StatementId=f'apigw-{api_id}-{path_part}'.replace('/', '-'),
            Action='lambda:InvokeFunction', Principal='apigateway.amazonaws.com',
            SourceArn=f'arn:aws:execute-api:{REGION}:{account_id}:{api_id}/*/*/{path_part}',
        )
        print('권한 추가')
    except lam.exceptions.ResourceConflictException:
        print('권한 이미 있음')


def deploy_stage_and_check(api_id, stage, path_part, description):
    """스테이지 배포 후 GET 이 응답할 때까지 대기 (새 경로는 반영까지 30초~1분). Lambda 응답(dict) 반환."""
    boto3.client('apigateway').create_deployment(restApiId=api_id, stageName=stage, description=description)
    url = f'https://{api_id}.execute-api.{REGION}.amazonaws.com/{stage}/{path_part}'
    for attempt in range(12):
        try:
            with urllib.request.urlopen(url) as r:
                print(url)
                return json.load(r)
        except urllib.error.HTTPError as e:
            print(f'{attempt}: HTTP {e.code} - 반영 대기 중...')
            time.sleep(10)
    raise RuntimeError('2분 넘게 응답이 없습니다. 콘솔에서 스테이지 배포를 확인하세요.')
