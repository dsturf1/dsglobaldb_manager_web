

import pandas as pd
import json
import boto3

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
            print(f"Downloading: {key} -> {local_file_path}")
            s3.download_file(bucket_name, key, local_file_path)

    print(f"Download complete: {local_dir}")