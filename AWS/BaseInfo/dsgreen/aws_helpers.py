
import geopandas as gpd
import pandas as pd
import json
import os
import tempfile
import boto3
import fiona
import glob

_Bucket='dsgeousergrp'
_GRP_Name = 'dsgeoadmin'

def load_all_json_from_prefix(bucket_name:str , prefix: str):
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
  
def saveJson(gdf, filename):

  with fiona.Env(OSR_WKT_FORMAT="WKT2_2018"):
    gdf.to_file(filename, driver='GeoJSON')

def upload2S3(filename, course_id, bucket_name: str, __GRP_Name: str):
  import boto3
  s3 = boto3.client('s3')
  json_content_ = json.load(open(filename, encoding="utf8"))
  s3.put_object(Body=json.dumps(json_content_).encode('utf-8'),Bucket=bucket_name,Key=__GRP_Name +'/coursegeojson/' +course_id+'.json')

def fromS3AsGDF(_course_id, bucket_name: str, __GRP_Name: str):
  import boto3
  s3 = boto3.client('s3')
  #S3로부터 전면 geojson화일 다운
  content_object = s3.get_object(Bucket=bucket_name,Key=__GRP_Name +'/coursegeojson/' +_course_id+'.json')
  file_content = content_object['Body'].read().decode('utf-8')
  json_content = json.loads(file_content)
  gdf = gpd.GeoDataFrame.from_features(json_content['features'], crs=int(4326))

  return gdf

def AreafromS3AsGDF(_course_id, bucket_name: str, __GRP_Name: str):
  import boto3
  s3 = boto3.client('s3')
  #S3로부터 전면 geojson화일 다운
  content_object = s3.get_object(Bucket=bucket_name,Key=__GRP_Name +'/geojson/' +_course_id+'.json')
  file_content = content_object['Body'].read().decode('utf-8')
  json_content = json.loads(file_content)
  gdf = gpd.GeoDataFrame.from_features(json_content['features'], crs=int(4326))

  return gdf

def cal_bearing(row):
  import pyproj
  geodesic = pyproj.Geod(ellps='WGS84')
  
  if row.Type == '홀영역':
    bearing = geodesic.inv(row.greencenter.x, row.greencenter.y, row.center.x, row.center.y)[0]
  else:
    bearing = 0.0

  return bearing


def download_s3_folder(bucket_name: str, local_dir: str, s3_prefix: str = ''):
    """
    Download all files from an S3 bucket or folder to a local directory.

    Args:
        bucket_name: Name of the S3 bucket
        local_dir: Local directory path to download files to
        s3_prefix: S3 prefix/folder path (e.g., 'folder/subfolder/').
                   Default is '' which downloads the entire bucket.
    """
    import os
    s3 = boto3.client('s3')

    # Ensure local directory exists
    if not os.path.exists(local_dir):
        os.makedirs(local_dir)

    # List all objects with the given prefix
    paginator = s3.get_paginator('list_objects_v2')

    for page in paginator.paginate(Bucket=bucket_name, Prefix=s3_prefix):
        if 'Contents' not in page:
            print(f"No files found in {s3_prefix}")
            return

        for obj in page['Contents']:
            key = obj['Key']

            # Skip if it's just the folder itself
            if key.endswith('/'):
                continue

            # Get relative path from prefix
            relative_path = key[len(s3_prefix):].lstrip('/')
            local_file_path = os.path.join(local_dir, relative_path)

            # Create subdirectories if needed
            local_file_dir = os.path.dirname(local_file_path)
            if local_file_dir and not os.path.exists(local_file_dir):
                os.makedirs(local_file_dir)

            # Download file
            # print(f"Downloading: {key} -> {local_file_path}")
            s3.download_file(bucket_name, key, local_file_path)

    print(f"Download {len(page['Contents'])} complete: {local_dir}")
    

def load_s3_json(bucket_name: str, s3_key: str, src_folder: str = None):
  """
  Download a JSON file from S3 to specified folder or temporary location and return its content.
  
  Args:
    bucket_name: Name of the S3 bucket
    s3_key: Full S3 key path to the JSON file (e.g., 'folder/file.json')
    src_folder: Optional folder path to save the file. If None, uses temporary file.
  
  Returns:
    dict: Parsed JSON content
  """
  
  s3 = boto3.client('s3')
  
  if src_folder:
    # Create folder if it doesn't exist
    if not os.path.exists(src_folder):
      os.makedirs(src_folder)
    
    # Create file path preserving S3 structure
    local_path = os.path.join(src_folder, s3_key.replace('/', os.sep))
    local_dir = os.path.dirname(local_path)
    
    if not os.path.exists(local_dir):
      os.makedirs(local_dir)
    
    try:
      # Download file to specified location
      print(f"Downloading: {s3_key} from bucket: {bucket_name}")
      s3.download_file(bucket_name, s3_key, local_path)
      
      # Read and parse JSON
      with open(local_path, 'r', encoding='utf-8') as f:
        json_content = json.load(f)
      
      print(f"Successfully loaded and saved JSON to {local_path}")
      return json_content
      
    except Exception as e:
      print(f"Error downloading file: {e}")
      raise
  else:
    print('src_folder must be provided to save the file.')
    return None
  
def save_s3_json(data, bucket_name, s3_key, src_folder):
  """Save JSON data to S3 bucket"""
  s3_client = boto3.client('s3')
  
  # Create local file path for backup
  local_file_path = os.path.join(src_folder, s3_key)
  os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
  
  # Save JSON to local file first
  with open(local_file_path, 'w', encoding='utf8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
  
  # Upload to S3
  try:
    s3_client.upload_file(local_file_path, bucket_name, s3_key)
    print(f"Successfully saved to s3://{bucket_name}/{s3_key}")
  except ClientError as e:
    print(f"Error uploading to S3: {e}")
    




def copy_files_from_downloaded2upload(src_folder, dest_folder):
  """
  Copy files from source folder to destination folder, handling subdirectories.
  """
  import shutil
  import os
  
  if not os.path.exists(dest_folder):
    os.makedirs(dest_folder)
  
  if not os.path.exists(src_folder):
    print(f"Source folder does not exist: {src_folder}")
    return
  
  for root, dirs, files in os.walk(src_folder):
    # Calculate relative path from source folder
    rel_path = os.path.relpath(root, src_folder)
    dest_dir = os.path.join(dest_folder, rel_path)
    
    # Create destination directory if it doesn't exist
    if not os.path.exists(dest_dir):
      os.makedirs(dest_dir)
    
    # Copy each file
    for file in files:
      src_file = os.path.join(root, file)
      dest_file = os.path.join(dest_dir, file)
      
      try:
        shutil.copy2(src_file, dest_file)
      except Exception as e:
        print(f"Error copying {src_file}: {e}")
        
    print(f"{len(files)} files copied from {src_folder} to {dest_folder} successfully.")
    
def fix_korean_json(folder):
  for f in os.listdir(folder):
    if f.endswith('.json'):
      path = os.path.join(folder, f)
      data = json.load(open(path, encoding='utf-8'))
      json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

def load_course_from_s3(bucket_name: str, course_id: str, grp_name: str = 'dsgeoadmin'):
  """
  S3에서 코스 GeoJSON 데이터를 로드하여 JSON dict로 반환.

  Args:
    bucket_name: S3 버킷 이름 (예: 'dsgeousergrp')
    course_id: 코스 ID (예: 'TGC001')
    grp_name: 그룹 폴더명 (기본값: 'dsgeoadmin')

  Returns:
    dict: GeoJSON 형식의 코스 데이터
    
  # 코스 데이터 로드
data = load_course_from_s3('dsgeousergrp', 'TGC001')

# grp_name 지정 가능
data = load_course_from_s3('dsgeousergrp', 'TGC001', grp_name='dsgeoadmin')
  """
  s3 = boto3.client('s3')
  s3_key = f'{grp_name}/coursegeojson/{course_id}.json'

  try:
    content_object = s3.get_object(Bucket=bucket_name, Key=s3_key)
    file_content = content_object['Body'].read().decode('utf-8')
    json_content = json.loads(file_content)
    return json_content
  except Exception as e:
    print(f"Error loading {s3_key} from {bucket_name}: {e}")
    return None

def load_baseinfo_from_s3(bucket_name: str, file_name: str, subfolder: str = 'common'):
  """
  S3에서 baseinfo JSON 데이터를 로드하여 반환.

  Args:
    bucket_name: S3 버킷 이름 (예: 'dsgeousergrp')
    file_name: 파일명 (예: 'course_info.json')
    subfolder: baseinfo 하위 폴더 (기본값: 'common', 또는 'geo')

  Returns:
    dict: JSON 데이터

  Example:
    data = load_baseinfo_from_s3('dsgeousergrp', 'course_info.json')
    data = load_baseinfo_from_s3('dsgeousergrp', 'area_def.json', subfolder='geo')
  """
  s3 = boto3.client('s3')
  s3_key = f'{subfolder}/{file_name}'

  try:
    content_object = s3.get_object(Bucket=bucket_name, Key=s3_key)
    file_content = content_object['Body'].read().decode('utf-8')
    json_content = json.loads(file_content)
    return json_content
  except Exception as e:
    print(f"Error loading {s3_key} from {bucket_name}: {e}")
    return None

def get_location_from_gps(crs_geojson: dict, gps: dict) -> list:
  """
  GPS 좌표를 기반으로 crs_geojson의 features에서 해당 위치의 모든 location 정보를 리스트로 반환.

  Args:
    crs_geojson: 코스 GeoJSON 데이터 (features 포함)
    gps: GPS 정보 dict (longitude, latitude 필수)
         예: {'longitude': Decimal('128.443'), 'latitude': Decimal('35.996'), ...}

  Returns:
    list: location 정보 리스트 [{'Hole': int, 'Area': str, 'Client': str, 'Course': str}, ...]
          해당 위치를 찾지 못하면 빈 리스트 반환

  Example:
    locations = get_location_from_gps(crs_geojson, gps)
  """
  from shapely.geometry import Point, shape

  lng = float(gps.get('longitude', 0))
  lat = float(gps.get('latitude', 0))

  if lng == 0 or lat == 0:
    return []

  point = Point(lng, lat)
  results = []

  for feature in crs_geojson.get('features', []):
    try:
      polygon = shape(feature['geometry'])
      if polygon.contains(point):
        props = feature.get('properties', {})
        results.append({
          'Hole': int(props.get('Hole', 0)) if props.get('Hole') is not None else 0,
          'Area': props.get('Type', ''),
          'Client': props.get('Client', ''),
          'Course': props.get('Course', '')
        })
    except Exception:
      continue

  return results

def get_best_location_from_gps(crs_geojson: dict, gps: dict, priority: list = None) -> dict:
  """
  GPS 좌표를 기반으로 우선순위에 따라 가장 적합한 location 정보를 반환.

  Args:
    crs_geojson: 코스 GeoJSON 데이터 (features 포함)
    gps: GPS 정보 dict (longitude, latitude 필수)
    priority: Area 우선순위 리스트 (기본값: ['홀영역', '그린', '지역', '코스', '전면'])

  Returns:
    dict: 우선순위가 가장 높은 location 정보 {'Hole': int, 'Area': str, 'Client': str, 'Course': str}
          해당 위치를 찾지 못하면 None 반환

  Example:
    location = get_best_location_from_gps(crs_geojson, gps)
    location = get_best_location_from_gps(crs_geojson, gps, priority=['그린', '홀영역', '코스'])
  """
  if priority is None:
    priority = ['홀영역', '그린', '지역', '코스', '전면']

  locations = get_location_from_gps(crs_geojson, gps)

  if not locations:
    return None

  for area_type in priority:
    for loc in locations:
      if loc.get('Area') == area_type:
        return loc

  # 우선순위에 없는 Area가 있으면 첫번째 반환
  return locations[0] if locations else None

def clean_and_normalize_features(features, default_props, mapdscourseid=None):
    """
    GeoJSON features의 properties를 정리하고 정규화합니다.
    
    1. default_props에 정의된 키만 유지
    2. 누락된 키는 기본값으로 채움
    3. mapdscourseid가 파라미터로 주어지면 모든 feature에 적용
       없으면 같은 Client의 다른 feature에서 찾아서 채움
    4. 타입이 맞지 않으면 올바른 타입으로 변환
    
    Args:
        features: GeoJSON features 리스트
        default_props: 기본 properties 딕셔너리
        mapdscourseid: 모든 feature에 적용할 mapdscourseid (선택사항)
    """
    # Client별 mapdscourseid 매핑 생성 (mapdscourseid 파라미터가 없을 때만 사용)
    client_to_courseid = {}
    if not mapdscourseid:
        for feature in features:
            props = feature.get('properties', {})
            client = props.get('Client', '')
            courseid = props.get('mapdscourseid')
            if client and courseid:
                client_to_courseid[client] = courseid
    
    for feature in features:
        if 'properties' not in feature:
            continue
            
        current_props = feature['properties']
        cleaned_props = {}
        
        # 1. default_props의 키만 유지하고 기본값 채우기
        for key, default_value in default_props.items():
            if key in current_props:
                value = current_props[key]
                
                # 2. 타입 변환
                expected_type = type(default_value)
                if not isinstance(value, expected_type):
                    try:
                        if expected_type == list:
                            if isinstance(value, str):
                                value = json.loads(value)
                            else:
                                value = list(value) if value else default_value.copy()
                        elif expected_type == float:
                            value = float(value)
                        elif expected_type == int:
                            value = int(value)
                        elif expected_type == str:
                            value = str(value)
                    except (ValueError, TypeError, json.JSONDecodeError):
                        value = default_value.copy() if isinstance(default_value, list) else default_value
                
                cleaned_props[key] = value
            else:
                # 기본값 사용
                cleaned_props[key] = default_value.copy() if isinstance(default_value, list) else default_value
        
        # 3. mapdscourseid 처리
        if mapdscourseid:
            # 파라미터로 받은 값으로 강제 설정
            cleaned_props['mapdscourseid'] = mapdscourseid
        elif not cleaned_props.get('mapdscourseid'):
            # 같은 Client에서 찾기
            client = cleaned_props.get('Client', '')
            if client and client in client_to_courseid:
                cleaned_props['mapdscourseid'] = client_to_courseid[client]
        
        feature['properties'] = cleaned_props
    
    print(f"Processed {len(features)} features")
    print(f"Properties keys: {list(default_props.keys())}")

    return features

def clean_and_normalize_json_file(file_path, default_props, mapdscourseid=None):
    """
    JSON 파일을 읽어서 properties를 정리하고 저장합니다.
    
    Args:
        file_path: JSON 파일 경로
        default_props: 기본 properties 딕셔너리
        mapdscourseid: 모든 feature에 적용할 mapdscourseid (선택사항)
    """
    with open(file_path, 'r', encoding='utf8') as f:
        json_content = json.load(f)
    
    features = clean_and_normalize_features(json_content['features'], default_props, mapdscourseid)

    with open(file_path, 'w', encoding='utf8') as f:
        json.dump(json_content, f, ensure_ascii=False, indent=2)

    print(f"Updated: {file_path} ({len(features)} features)")
    
def download_baseinfo(base_folder):
    """
    S3에서 baseinfo 파일들을 다운로드하고 한글 인코딩을 수정합니다.

    Args:
        base_folder: 다운로드할 로컬 폴더 경로
    """
    prefixes = ['common/', 'geo/', 'outrecord/', 'work/']
    for prefix in prefixes:
        download_s3_folder(bucket_name='dsbaseinfo', s3_prefix=prefix, local_dir=base_folder+'/'+prefix)
        fix_korean_json(base_folder+'/'+prefix)

def download_course_geojson(grp_name, geojson_folder):
  

    """
    S3에서 course geojson 파일들을 다운로드하고 한글 인코딩을 수정합니다.

    Args:
        grp_name: 그룹 이름 (예: 'dsgeoadmin')
        geojson_folder: 다운로드할 로컬 폴더 경로
    """
    download_s3_folder(bucket_name='dsgeousergrp', s3_prefix=grp_name+'/coursegeojson/', local_dir=geojson_folder)
    fix_korean_json(geojson_folder)

def updateMGCbaseinfoFromFile(out_folder):
    """
    out_folder에서 mapdscourse_info.json 파일을 찾아 S3에 업로드합니다.
    
    Args:
        out_folder: ToUpload 폴더 경로
    """
    baseinfo_path = os.path.join(out_folder, 'baseinfo')
    file_list = glob.glob(os.path.join(baseinfo_path, '**', '*'), recursive=True)
    file_list = [f for f in file_list if os.path.isfile(f) and ('mapcourse_info.json' in f)]
    
    print(f"Total mapdscourse_info.json files found: {len(file_list)}")
    for file in file_list:
        print(file)
    
    # Upload files to S3
    s3_client = boto3.client('s3')
    bucket_name = 'dsbaseinfo'
    
    for file in file_list:
        relative_path = os.path.relpath(file, baseinfo_path)
        s3_key = relative_path.replace('\\', '/')
        
        try:
            s3_client.upload_file(file, bucket_name, s3_key)
            print(f"Uploaded: {file} -> s3://{bucket_name}/{s3_key}")
        except ClientError as e:
            print(f"Error uploading {file}: {e}")


def updateTGCbaseinfoFromFile(out_folder):
    """
    out_folder에서 mapcourse_info.json 파일을 찾아 S3에 업로드합니다.

    Args:
        out_folder: ToUpload 폴더 경로
    """
    baseinfo_path = os.path.join(out_folder, 'baseinfo')
    file_list = glob.glob(os.path.join(baseinfo_path, '**', '*'), recursive=True)
    file_list = [f for f in file_list if os.path.isfile(f) and ('mapdscourse_info.json' in f)]

    print(f"Total mapcourse_info.json files found: {len(file_list)}")
    for file in file_list:
        print(file)

    # Upload files to S3
    s3_client = boto3.client('s3')
    bucket_name = 'dsbaseinfo'

    for file in file_list:
        relative_path = os.path.relpath(file, baseinfo_path)
        s3_key = relative_path.replace('\\', '/')

        try:
            s3_client.upload_file(file, bucket_name, s3_key)
            print(f"Uploaded: {file} -> s3://{bucket_name}/{s3_key}")
        except ClientError as e:
            print(f"Error uploading {file}: {e}")


import re
from botocore.exceptions import ClientError

def load_default_feature_properties(file_path: str = './sample_cleanup/default_feature_properties.json') -> dict:
    """
    GeoJSON feature의 기본 properties 템플릿을 로드합니다.

    Args:
        file_path: JSON 파일 경로 (기본값: './sample_cleanup/default_feature_properties.json')

    Returns:
        dict: 기본 properties 딕셔너리

    Example:
        default_props = load_default_feature_properties()
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_available_dates(src_folder: str) -> list:
    """
    Downloaded 폴더에서 baseinfo와 geojson이 모두 있는 날짜들을 추출합니다.

    Args:
        src_folder: Downloaded/{grp_name} 폴더 경로

    Returns:
        list: 사용 가능한 날짜 리스트 (YYYYMMDD 형식, 최신순 정렬)

    Example:
        dates = get_available_dates('./Downloaded/dsgeoadmin')
        # ['20260119', '20260113', '20260112']
    """
    baseinfo_dates = set()
    geojson_dates = set()

    date_pattern = re.compile(r'(baseinfo|geojson)(\d{8})')

    if not os.path.exists(src_folder):
        print(f"폴더가 존재하지 않습니다: {src_folder}")
        return []

    for folder_name in os.listdir(src_folder):
        match = date_pattern.match(folder_name)
        if match:
            folder_type = match.group(1)
            date_str = match.group(2)

            if folder_type == 'baseinfo':
                baseinfo_dates.add(date_str)
            elif folder_type == 'geojson':
                geojson_dates.add(date_str)

    available_dates = sorted(baseinfo_dates & geojson_dates, reverse=True)

    print(f"=== Downloaded 폴더 분석 ===")
    print(f"baseinfo 날짜: {sorted(baseinfo_dates, reverse=True)}")
    print(f"geojson 날짜: {sorted(geojson_dates, reverse=True)}")
    print(f"사용 가능한 날짜 (둘 다 존재): {available_dates}")

    return available_dates


def upload_baseinfo_to_s3(src_folder: str, date_str: str) -> tuple:
    """
    지정된 날짜의 baseinfo 폴더 내용을 S3 dsbaseinfo 버킷에 업로드합니다.

    Args:
        src_folder: Downloaded/{grp_name} 폴더 경로
        date_str: 날짜 문자열 (YYYYMMDD)

    Returns:
        tuple: (업로드 성공 수, 실패 수)

    Example:
        upload_baseinfo_to_s3('./Downloaded/dsgeoadmin', '20260112')
    """
    s3_client = boto3.client('s3')
    bucket_name = 'dsbaseinfo'

    baseinfo_folder = os.path.join(src_folder, f'baseinfo{date_str}')

    if not os.path.exists(baseinfo_folder):
        print(f"baseinfo 폴더가 존재하지 않습니다: {baseinfo_folder}")
        return (0, 0)

    uploaded_count = 0
    error_count = 0

    for root, dirs, files in os.walk(baseinfo_folder):
        for file in files:
            if file.endswith('.json'):
                local_path = os.path.join(root, file)
                relative_path = os.path.relpath(local_path, baseinfo_folder)
                s3_key = relative_path.replace('\\', '/')

                try:
                    s3_client.upload_file(local_path, bucket_name, s3_key)
                    print(f"Uploaded: {s3_key}")
                    uploaded_count += 1
                except ClientError as e:
                    print(f"Error uploading {local_path}: {e}")
                    error_count += 1

    print(f"\n=== baseinfo 업로드 완료 ===")
    print(f"성공: {uploaded_count}개, 실패: {error_count}개")
    return (uploaded_count, error_count)


def upload_geojson_to_s3(src_folder: str, date_str: str, grp_name: str = 'dsgeoadmin') -> tuple:
    """
    지정된 날짜의 geojson 폴더 내용을 S3 dsgeousergrp 버킷에 업로드합니다.

    Args:
        src_folder: Downloaded/{grp_name} 폴더 경로
        date_str: 날짜 문자열 (YYYYMMDD)
        grp_name: 그룹명 (기본값: 'dsgeoadmin')

    Returns:
        tuple: (업로드 성공 수, 실패 수)

    Example:
        upload_geojson_to_s3('./Downloaded/dsgeoadmin', '20260112', 'dsgeoadmin')
    """
    s3_client = boto3.client('s3')
    bucket_name = 'dsgeousergrp'

    geojson_folder = os.path.join(src_folder, f'geojson{date_str}')

    if not os.path.exists(geojson_folder):
        print(f"geojson 폴더가 존재하지 않습니다: {geojson_folder}")
        return (0, 0)

    uploaded_count = 0
    error_count = 0

    for file in os.listdir(geojson_folder):
        if file.endswith('.json'):
            local_path = os.path.join(geojson_folder, file)
            s3_key = f"{grp_name}/coursegeojson/{file}"

            try:
                s3_client.upload_file(local_path, bucket_name, s3_key)
                print(f"Uploaded: {s3_key}")
                uploaded_count += 1
            except ClientError as e:
                print(f"Error uploading {local_path}: {e}")
                error_count += 1

    print(f"\n=== geojson 업로드 완료 ===")
    print(f"성공: {uploaded_count}개, 실패: {error_count}개")
    return (uploaded_count, error_count)


def reset_to_date(src_folder: str, date_str: str, grp_name: str = 'dsgeoadmin'):
    """
    지정된 날짜의 baseinfo와 geojson을 모두 S3에 업로드하여 해당 날짜로 리셋합니다.

    Args:
        src_folder: Downloaded/{grp_name} 폴더 경로
        date_str: 날짜 문자열 (YYYYMMDD)
        grp_name: 그룹명 (기본값: 'dsgeoadmin')

    Example:
        reset_to_date('./Downloaded/dsgeoadmin', '20260112', 'dsgeoadmin')
    """
    print(f"===== {date_str} 날짜로 리셋 시작 =====\n")

    print("[1/2] baseinfo 업로드 중...")
    base_result = upload_baseinfo_to_s3(src_folder, date_str)
    print()

    print("[2/2] geojson 업로드 중...")
    geo_result = upload_geojson_to_s3(src_folder, date_str, grp_name)
    print()

    print(f"===== {date_str} 날짜로 리셋 완료 =====")
    print(f"총 업로드: baseinfo {base_result[0]}개, geojson {geo_result[0]}개")


def extract_types_from_geojson(geojson_path: str) -> list:
    """
    GeoJSON 파일에서 Type 속성의 고유값들을 추출합니다.

    Args:
        geojson_path: GeoJSON 파일 경로

    Returns:
        list: 정렬된 Type 값 리스트
    """
    try:
        with open(geojson_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        types_found = set()
        if 'features' in data:
            for feature in data['features']:
                if 'properties' in feature and 'Type' in feature['properties']:
                    types_found.add(feature['properties']['Type'])

        return sorted(list(types_found))
    except Exception as e:
        print(f"Error reading {geojson_path}: {e}")
        return []


def update_type_created_from_geojson(baseinfo_path: str, geojson_folder: str, prefix: str = None) -> list:
    """
    baseinfo JSON의 각 항목에 대해 해당 geojson에서 Type을 추출하여 Type_created를 업데이트합니다.

    Args:
        baseinfo_path: baseinfo JSON 파일 경로 (예: course_info.json)
        geojson_folder: geojson 파일들이 있는 폴더 경로
        prefix: 처리할 id prefix (예: 'TGC', 'MGC'). None이면 모두 처리

    Returns:
        list: 업데이트된 baseinfo 데이터

    Example:
        # TGC만 처리
        data = update_type_created_from_geojson(baseinfo_path, geojson_folder, prefix='TGC')
        # MGC만 처리
        data = update_type_created_from_geojson(baseinfo_path, geojson_folder, prefix='MGC')
        # 모두 처리
        data = update_type_created_from_geojson(baseinfo_path, geojson_folder)
    """
    with open(baseinfo_path, 'r', encoding='utf-8') as f:
        baseinfo_data = json.load(f)

    updated_count = 0
    not_found_count = 0
    skipped_count = 0

    for obj in baseinfo_data:
        if 'id' not in obj:
            continue

        course_id = obj['id']

        # prefix 필터링
        if prefix and not course_id.startswith(prefix):
            skipped_count += 1
            continue

        geojson_file = os.path.join(geojson_folder, f'{course_id}.json')

        if os.path.exists(geojson_file):
            types = extract_types_from_geojson(geojson_file)
            obj['Type_created'] = types
            updated_count += 1
        else:
            obj['Type_created'] = []
            not_found_count += 1
            print(f"  Geojson not found: {course_id}")

    # 파일 저장
    with open(baseinfo_path, 'w', encoding='utf-8') as f:
        json.dump(baseinfo_data, f, ensure_ascii=False, indent=2)

    print(f"=== Type_created 업데이트 완료 ({prefix or 'ALL'}) ===")
    print(f"업데이트: {updated_count}개, 미발견: {not_found_count}개, 스킵: {skipped_count}개")
    print(f"저장: {baseinfo_path}")

    return baseinfo_data


def get_course_files(folder: str, prefix: str, min_num: int = 1, max_num: int = 899) -> list:
    """
    지정된 prefix와 번호 범위에 해당하는 GeoJSON 파일 목록을 반환합니다.

    Args:
        folder: GeoJSON 파일이 있는 폴더 경로
        prefix: 파일 prefix (예: 'MGC', 'TGC')
        min_num: 최소 번호 (기본값: 1)
        max_num: 최대 번호 (기본값: 899)

    Returns:
        list: 정렬된 파일 경로 리스트

    Example:
        mgc_files = get_course_files('./coursegeojson', 'MGC')  # MGC001~MGC899
        tgc_files = get_course_files('./coursegeojson', 'TGC', 1, 100)  # TGC001~TGC100
    """
    files = glob.glob(os.path.join(folder, f'{prefix}*.json'))
    result = []
    for f in files:
        basename = os.path.basename(f)
        try:
            num = int(basename.replace(prefix, '').replace('.json', ''))
            if min_num <= num <= max_num:
                result.append(f)
        except ValueError:
            continue
    return sorted(result)


def check_geojson_file(file_path: str, default_props: dict, unwanted_types: list = None) -> dict:
    """
    GeoJSON 파일을 검사하여 문제점을 반환합니다.

    Args:
        file_path: GeoJSON 파일 경로
        default_props: 기본 properties 템플릿
        unwanted_types: 허용되지 않는 Type 리스트 (기본값: ['Undefined', '그린B'])

    Returns:
        dict: 검사 결과 (unwanted_types, missing_keys, type_mismatches, extra_keys, wrong_courseid)
    """
    from collections import defaultdict

    if unwanted_types is None:
        unwanted_types = ['Undefined', '그린B']

    basename = os.path.basename(file_path)
    expected_courseid = basename.replace('.json', '')

    result = {
        'file': basename,
        'expected_courseid': expected_courseid,
        'feature_count': 0,
        'unwanted_types': defaultdict(int),
        'missing_keys': set(),
        'type_mismatches': defaultdict(set),
        'extra_keys': set(),
        'wrong_courseid': defaultdict(int),
    }

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        result['error'] = str(e)
        return result

    features = data.get('features', [])
    result['feature_count'] = len(features)

    for feature in features:
        props = feature.get('properties', {})

        # 1. Unwanted Type 검사
        feature_type = props.get('Type', '')
        if feature_type in unwanted_types:
            result['unwanted_types'][feature_type] += 1

        # 2. Missing Keys 검사
        for key in default_props.keys():
            if key not in props:
                result['missing_keys'].add(key)

        # 3. Type Mismatches & Extra Keys 검사
        for key, value in props.items():
            if key in default_props:
                expected_type = type(default_props[key])
                actual_type = type(value)
                if expected_type != actual_type:
                    result['type_mismatches'][key].add(
                        f"{actual_type.__name__} (expected: {expected_type.__name__})"
                    )
            else:
                result['extra_keys'].add(key)

        # 4. mapdscourseid 검사
        mapdscourseid = props.get('mapdscourseid', '')
        if mapdscourseid != expected_courseid:
            result['wrong_courseid'][mapdscourseid] += 1

    return result


def check_geojson_files(folder: str, default_props: dict = None, unwanted_types: list = None, prefixes: list = None, save_report: str = None):
    """
    폴더 내 모든 GeoJSON 파일을 검사하고 결과를 출력합니다.

    Args:
        folder: GeoJSON 파일이 있는 폴더 경로
        default_props: 기본 properties 템플릿 (None이면 자동 로드)
        unwanted_types: 허용되지 않는 Type 리스트
        prefixes: 검사할 prefix 리스트 (기본값: ['MGC', 'TGC'])
        save_report: 결과를 저장할 파일 경로 (None이면 저장 안함)

    Returns:
        tuple: (all_results, problem_results)
    """
    from datetime import datetime

    if default_props is None:
        default_props = load_default_feature_properties()
    if unwanted_types is None:
        unwanted_types = ['Undefined', '그린B']
    if prefixes is None:
        prefixes = ['MGC', 'TGC']

    # 파일 수집
    all_files = []
    file_counts = {}
    for prefix in prefixes:
        files = get_course_files(folder, prefix)
        file_counts[prefix] = len(files)
        all_files.extend(files)

    print(f"검사 대상: {' + '.join([f'{p}: {file_counts[p]}개' for p in prefixes])} = 총 {len(all_files)}개")

    # 검사 실행
    all_results = []
    for file_path in all_files:
        result = check_geojson_file(file_path, default_props, unwanted_types)
        all_results.append(result)

    # 문제 있는 결과 필터링
    def has_problems(r):
        return (r.get('error') or r['unwanted_types'] or r['missing_keys'] or
                r['type_mismatches'] or r['extra_keys'] or r['wrong_courseid'])

    problem_results = [r for r in all_results if has_problems(r)]

    # 출력 및 리포트 생성
    report_lines = []
    report_lines.append(f"GeoJSON 검사 리포트 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append(f"검사 대상: {' + '.join([f'{p}: {file_counts[p]}개' for p in prefixes])} = 총 {len(all_files)}개")
    report_lines.append("")

    # 문제 있는 파일 상세 출력
    if problem_results:
        print(f"\n=== 문제가 있는 파일: {len(problem_results)}개 ===\n")
        report_lines.append(f"=== 문제가 있는 파일: {len(problem_results)}개 ===")
        report_lines.append("")

        for result in problem_results:
            line = f"📁 {result['file']} (Features: {result['feature_count']})"
            print(line)
            report_lines.append(line)

            if result.get('error'):
                line = f"  ❌ Error: {result['error']}"
                print(line + "\n")
                report_lines.append(line)
                report_lines.append("")
                continue

            if result['unwanted_types']:
                line = f"  ⚠️ Unwanted Types: {dict(result['unwanted_types'])}"
                print(line)
                report_lines.append(line)
            if result['missing_keys']:
                line = f"  ❌ Missing Keys: {sorted(result['missing_keys'])}"
                print(line)
                report_lines.append(line)
            if result['type_mismatches']:
                line = f"  ❌ Type Mismatches: {dict((k, sorted(v)) for k, v in result['type_mismatches'].items())}"
                print(line)
                report_lines.append(line)
            if result['extra_keys']:
                line = f"  ⚠️ Extra Keys: {sorted(result['extra_keys'])}"
                print(line)
                report_lines.append(line)
            if result['wrong_courseid']:
                line = f"  ❌ Wrong mapdscourseid: {dict(result['wrong_courseid'])}"
                print(line)
                report_lines.append(line)
            print()
            report_lines.append("")

    # 최종 요약
    total_features = sum(r['feature_count'] for r in all_results)
    summary_lines = [
        "=" * 50,
        "                   최종 요약",
        "=" * 50,
        f"검사 파일: {len(all_results)}개, 총 Features: {total_features}개",
        f"문제 있는 파일: {len(problem_results)}개"
    ]

    if problem_results:
        summary_lines.extend([
            f"  - Unwanted Types: {sum(1 for r in all_results if r['unwanted_types'])}개",
            f"  - Missing Keys: {sum(1 for r in all_results if r['missing_keys'])}개",
            f"  - Type Mismatches: {sum(1 for r in all_results if r['type_mismatches'])}개",
            f"  - Extra Keys: {sum(1 for r in all_results if r['extra_keys'])}개",
            f"  - Wrong mapdscourseid: {sum(1 for r in all_results if r['wrong_courseid'])}개"
        ])
    else:
        summary_lines.append("✅ 모든 파일이 정상입니다!")

    for line in summary_lines:
        print(line)
        report_lines.append(line)

    # 파일로 저장
    if save_report:
        with open(save_report, 'w', encoding='utf-8') as f:
            f.write('\n'.join(report_lines))
        print(f"\n📄 리포트 저장: {save_report}")

    return all_results, problem_results


def parse_geojson_report(report_path: str) -> list:
    """
    CRS-0에서 생성된 리포트 파일을 파싱하여 문제가 있는 코스 ID 리스트를 반환합니다.

    Args:
        report_path: 리포트 파일 경로

    Returns:
        list: 문제가 있는 코스 ID 리스트 (예: ['MGC001', 'TGC002'])

    Example:
        problem_ids = parse_geojson_report('./Reports/geojson_check_20260120.txt')
    """
    problem_ids = []

    with open(report_path, 'r', encoding='utf-8') as f:
        for line in f:
            # 📁 MGC001.json (Features: 123) 형식 파싱
            if line.strip().startswith('📁'):
                match = re.search(r'📁\s+(\w+)\.json', line)
                if match:
                    problem_ids.append(match.group(1))

    return problem_ids


def fix_geojson_file(file_path: str, default_props: dict = None, unwanted_types: list = None) -> dict:
    """
    GeoJSON 파일의 문제를 수정합니다.

    수정 항목:
    1. Unwanted Types: 해당 feature 삭제
    2. Missing Keys: 기본값으로 추가
    3. Extra Keys: 제거
    4. Type Mismatches: 올바른 타입으로 변환
    5. Wrong mapdscourseid: 파일명 기준으로 수정

    Args:
        file_path: GeoJSON 파일 경로
        default_props: 기본 properties 템플릿 (None이면 자동 로드)
        unwanted_types: 삭제할 Type 리스트 (기본값: ['Undefined', '그린B'])

    Returns:
        dict: 수정 결과 요약

    Example:
        result = fix_geojson_file('./coursegeojson/MGC001.json')
        result = fix_geojson_file('./coursegeojson/MGC001.json', unwanted_types=['Undefined', '그린B'])
    """
    if default_props is None:
        default_props = load_default_feature_properties()

    if unwanted_types is None:
        unwanted_types = ['Undefined', '그린B']

    basename = os.path.basename(file_path)
    expected_courseid = basename.replace('.json', '')

    result = {
        'file': basename,
        'deleted_features': 0,
        'fixed_missing_keys': 0,
        'fixed_extra_keys': 0,
        'fixed_type_mismatches': 0,
        'fixed_wrong_courseid': 0,
    }

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        result['error'] = str(e)
        return result

    features = data.get('features', [])
    original_count = len(features)

    # 1. Unwanted Types feature 삭제
    filtered_features = []
    for feature in features:
        props = feature.get('properties', {})
        feature_type = props.get('Type', '')
        if feature_type in unwanted_types:
            result['deleted_features'] += 1
        else:
            filtered_features.append(feature)

    # 남은 features 처리
    for feature in filtered_features:
        props = feature.get('properties', {})

        # 2. Wrong mapdscourseid 수정
        if props.get('mapdscourseid', '') != expected_courseid:
            props['mapdscourseid'] = expected_courseid
            result['fixed_wrong_courseid'] += 1

        # 3. Missing Keys 추가 및 Type Mismatches 수정
        for key, default_value in default_props.items():
            if key not in props:
                props[key] = default_value.copy() if isinstance(default_value, list) else default_value
                result['fixed_missing_keys'] += 1
            else:
                # Type mismatch 수정
                expected_type = type(default_value)
                if not isinstance(props[key], expected_type):
                    try:
                        if expected_type == list:
                            if isinstance(props[key], str):
                                props[key] = json.loads(props[key])
                            else:
                                props[key] = list(props[key]) if props[key] else default_value.copy()
                        elif expected_type == float:
                            props[key] = float(props[key])
                        elif expected_type == int:
                            props[key] = int(props[key])
                        elif expected_type == str:
                            props[key] = str(props[key])
                        result['fixed_type_mismatches'] += 1
                    except (ValueError, TypeError, json.JSONDecodeError):
                        props[key] = default_value.copy() if isinstance(default_value, list) else default_value
                        result['fixed_type_mismatches'] += 1

        # 4. Extra Keys 제거
        extra_keys = [k for k in props.keys() if k not in default_props]
        for key in extra_keys:
            del props[key]
            result['fixed_extra_keys'] += 1

        feature['properties'] = props

    # features 업데이트
    data['features'] = filtered_features

    # 파일 저장
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return result


def fix_geojsons_from_report(report_path: str, geojson_folder: str, default_props: dict = None, unwanted_types: list = None) -> list:
    """
    리포트 파일을 읽어 문제가 있는 GeoJSON 파일들을 수정합니다.

    Args:
        report_path: CRS-0에서 생성된 리포트 파일 경로
        geojson_folder: GeoJSON 파일들이 있는 폴더 경로
        default_props: 기본 properties 템플릿 (None이면 자동 로드)
        unwanted_types: 삭제할 Type 리스트 (기본값: ['Undefined', '그린B'])

    Returns:
        list: 각 파일별 수정 결과 리스트

    Example:
        results = fix_geojsons_from_report(
            './Reports/geojson_check_20260120.txt',
            './ToUpload/dsgeoadmin/coursegeojson'
        )
    """
    if default_props is None:
        default_props = load_default_feature_properties()

    if unwanted_types is None:
        unwanted_types = ['Undefined', '그린B']

    # 리포트에서 문제 있는 코스 ID 파싱
    problem_ids = parse_geojson_report(report_path)

    if not problem_ids:
        print("리포트에서 문제가 있는 파일을 찾을 수 없습니다.")
        return []

    print(f"=== 수정 대상: {len(problem_ids)}개 파일 ===")
    print(f"코스 ID: {problem_ids}\n")

    results = []
    total_deleted = 0

    for course_id in problem_ids:
        file_path = os.path.join(geojson_folder, f'{course_id}.json')

        if not os.path.exists(file_path):
            print(f"⚠️ 파일 없음: {file_path}")
            results.append({'file': f'{course_id}.json', 'error': 'File not found'})
            continue

        result = fix_geojson_file(file_path, default_props, unwanted_types)
        results.append(result)

        # 수정 결과 출력
        deleted = result.get('deleted_features', 0)
        total_deleted += deleted
        total_fixes = (result.get('fixed_missing_keys', 0) +
                      result.get('fixed_extra_keys', 0) +
                      result.get('fixed_type_mismatches', 0) +
                      result.get('fixed_wrong_courseid', 0))

        if result.get('error'):
            print(f"❌ {result['file']}: {result['error']}")
        elif deleted > 0 or total_fixes > 0:
            msg = f"✅ {result['file']}:"
            if deleted > 0:
                msg += f" {deleted}개 feature 삭제"
            if total_fixes > 0:
                msg += f" {total_fixes}개 수정"
            print(msg)
        else:
            print(f"✓ {result['file']}: 수정 불필요")

    # 최종 요약
    print(f"\n=== 수정 완료 ===")
    total_files = len([r for r in results if not r.get('error')])
    print(f"처리 파일: {total_files}개")
    if total_deleted > 0:
        print(f"삭제된 feature 총: {total_deleted}개")

    return results