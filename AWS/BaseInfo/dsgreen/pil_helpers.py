import os
import rasterio
from PIL import Image
import numpy as np
from pathlib import Path
import glob

Image.MAX_IMAGE_PIXELS = None
def convert_tif_to_png(input_path, output_path, scale=0.5, background_threshold=10):
    """
    TIFF 파일을 PNG로 변환하는 함수 (해상도 축소 + 배경 투명 처리)
    
    Parameters:
    input_path (str): 입력 TIFF 파일 경로
    output_path (str): 출력 PNG 파일 경로
    scale (float): 이미지 축소 비율 (0.5 = 50%, 즉 1/4 화질)
    background_threshold (int): 검은색으로 간주할 픽셀 값 임계값 (0-255)
    """
    try:
        # rasterio로 TIFF 파일 읽기
        with rasterio.open(input_path) as src:
            # 모든 밴드 읽기
            data = src.read()
            
            # 데이터 타입과 밴드 수 확인
            band_count = data.shape[0]
            
            # RGB 이미지로 변환 (밴드가 3개 이상인 경우)
            if band_count >= 3:
                # 첫 3개 밴드를 RGB로 사용
                rgb = np.stack([data[0], data[1], data[2]], axis=-1)
            elif band_count == 1:
                # 단일 밴드인 경우 그레이스케일
                rgb = data[0]
            else:
                print(f"경고: {input_path}의 밴드 수가 {band_count}개입니다.")
                return False
            
            # 데이터 타입 정규화 (0-255 범위로)
            if rgb.dtype == np.uint16:
                # 16비트를 8비트로 변환
                rgb = (rgb / 256).astype(np.uint8)
            elif rgb.dtype == np.float32 or rgb.dtype == np.float64:
                # float 타입을 0-255 범위로 변환
                rgb = ((rgb - rgb.min()) / (rgb.max() - rgb.min()) * 255).astype(np.uint8)
            elif rgb.dtype != np.uint8:
                rgb = rgb.astype(np.uint8)
            
            # PIL Image로 변환
            if band_count >= 3:
                img = Image.fromarray(rgb, mode='RGB')
            else:
                img = Image.fromarray(rgb, mode='L')
            
            # 원본 크기 확인
            original_size = img.size
            print(f"  원본 크기: {original_size[0]} x {original_size[1]}")
            
            # 이미지 크기 축소 (1/4 화질 = 50% 크기)
            new_size = (int(original_size[0] * scale), int(original_size[1] * scale))
            img_resized = img.resize(new_size, Image.Resampling.LANCZOS)
            print(f"  변환 크기: {new_size[0]} x {new_size[1]}")
            
            # RGB를 RGBA로 변환 (투명도 채널 추가)
            if img_resized.mode == 'RGB':
                img_rgba = img_resized.convert('RGBA')
            elif img_resized.mode == 'L':
                img_rgba = img_resized.convert('RGBA')
            else:
                img_rgba = img_resized
            
            # numpy 배열로 변환
            data_array = np.array(img_rgba)
            
            # 배경(검은색) 픽셀을 투명하게 처리
            # RGB 값이 모두 임계값 이하인 픽셀을 찾기
            if len(data_array.shape) == 3 and data_array.shape[2] == 4:
                # RGBA 이미지
                r, g, b, a = data_array[:, :, 0], data_array[:, :, 1], data_array[:, :, 2], data_array[:, :, 3]
                # 검은색 픽셀 마스크 (R, G, B 모두 임계값 이하)
                black_mask = (r <= background_threshold) & (g <= background_threshold) & (b <= background_threshold)
                # 알파 채널을 0(투명)으로 설정
                data_array[black_mask, 3] = 0
                
                transparent_pixels = np.sum(black_mask)
                total_pixels = black_mask.size
                print(f"  투명 처리: {transparent_pixels:,} / {total_pixels:,} 픽셀 ({transparent_pixels/total_pixels*100:.1f}%)")
            
            # 다시 PIL Image로 변환
            img_final = Image.fromarray(data_array, 'RGBA')
            
            # PNG로 저장
            img_final.save(output_path, 'PNG', optimize=True)
            
            print(f"변환 완료: {input_path} -> {output_path}")
            return True
            
    except Exception as e:
        print(f"변환 실패 ({input_path}): {e}")
        import traceback
        traceback.print_exc()
        return False
      
      
def resize_png_to_small(input_path, output_path, scale=0.2):
    """
    PNG 파일을 더 작은 크기로 축소하는 함수
    
    Parameters:
    input_path (str): 입력 PNG 파일 경로
    output_path (str): 출력 PNG 파일 경로 (_small 접미사)
    scale (float): 이미지 축소 비율 (0.316 = 약 31.6%, 원본 대비 10% 면적)
    """
    try:
        # PNG 파일 열기
        img = Image.open(input_path)
        
        # 원본 크기 확인
        original_size = img.size
        print(f"  원본 크기: {original_size[0]} x {original_size[1]}")
        
        # 이미지 크기 축소 (원본 대비 10% 면적 = 약 31.6% 선형 축소)
        new_size = (int(original_size[0] * scale), int(original_size[1] * scale))
        img_resized = img.resize(new_size, Image.Resampling.LANCZOS)
        print(f"  _small 크기: {new_size[0]} x {new_size[1]} (면적 {(new_size[0]*new_size[1])/(original_size[0]*original_size[1])*100:.1f}%)")
        
        # PNG로 저장 (이미 RGBA 모드이므로 투명도 유지)
        img_resized.save(output_path, 'PNG', optimize=True)
        
        print(f"축소 완료: {output_path}")
        return True
        
    except Exception as e:
        print(f"축소 실패 ({input_path}): {e}")
        import traceback
        traceback.print_exc()
        return False
    
import os
import glob
import rasterio
from rasterio.enums import Resampling
import cv2
import numpy as np
from concurrent.futures import ProcessPoolExecutor, as_completed
from tqdm.auto import tqdm

def fast_convert_tif_to_png(input_tif, output_png, max_size=5000, scale=1.0):
    """최적화된 TIF to PNG 변환

    Parameters:
    input_tif (str): 입력 TIFF 파일 경로
    output_png (str): 출력 PNG 파일 경로
    max_size (int): 최대 이미지 크기 (픽셀)
    scale (float): 추가 축소 비율 (1.0 = 원본, 0.5 = 50%)
    """
    with rasterio.open(input_tif) as src:
        # 크기 계산
        width, height = src.width, src.height

        # max_size에 따른 축소
        if width > max_size or height > max_size:
            size_scale = max_size / max(width, height)
            new_width = int(width * size_scale)
            new_height = int(height * size_scale)
        else:
            new_width, new_height = width, height

        # 추가 scale 적용
        new_width = int(new_width * scale)
        new_height = int(new_height * scale)
        
        # RGB 읽기 (한 번에)
        if src.count >= 3:
            data = src.read(
                [1, 2, 3],
                out_shape=(3, new_height, new_width),
                resampling=Resampling.bilinear
            )
            img = np.transpose(data, (1, 2, 0))
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        else:
            img = src.read(
                1,
                out_shape=(new_height, new_width),
                resampling=Resampling.bilinear
            )
        
        # 빠른 PNG 저장 (압축 레벨 낮춤)
        cv2.imwrite(output_png, img, [
            cv2.IMWRITE_PNG_COMPRESSION, 1,  # 압축 레벨 1 (빠름)
            cv2.IMWRITE_PNG_STRATEGY, cv2.IMWRITE_PNG_STRATEGY_FILTERED
        ])
    
    return os.path.basename(output_png)


# 전체 디렉토리 병렬 변환
def convert_all_tif_to_png(src_folder='./cog_tif', out_folder='./png', max_workers=8, scale=1.0, max_size=5000):
    """전체 TIF 파일을 병렬로 PNG 변환

    Parameters:
    src_folder (str): 입력 TIF 파일들이 있는 폴더
    out_folder (str): 출력 PNG 파일들을 저장할 폴더
    max_workers (int): 병렬 처리 워커 수
    scale (float): 이미지 축소 비율 (1.0 = 원본, 0.5 = 50%, 0.2 = 20%)
    max_size (int): 최대 이미지 크기 (픽셀)
    """

    # 모든 TIF 파일 찾기
    tif_files = glob.glob(os.path.join(src_folder, '**/*.tif'), recursive=True)

    print(f"Found {len(tif_files)} TIF files")
    print(f"Scale: {scale * 100:.1f}%, Max size: {max_size}px")

    # 작업 생성
    tasks = []
    for tif_file in tif_files:
        # 출력 경로 계산
        rel_path = os.path.relpath(tif_file, src_folder)
        output_png = os.path.join(out_folder, rel_path.replace('.tif', '.png'))

        # 출력 디렉토리 생성
        os.makedirs(os.path.dirname(output_png), exist_ok=True)

        tasks.append((tif_file, output_png))

    # 병렬 처리
    print(f"Converting with {max_workers} workers...")

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(fast_convert_tif_to_png, tif, png, max_size, scale): (tif, png)
            for tif, png in tasks
        }
        
        results = []
        with tqdm(total=len(futures), desc="Converting") as pbar:
            for future in as_completed(futures):
                try:
                    result = future.result()
                    results.append(f"✓ {result}")
                except Exception as e:
                    tif, png = futures[future]
                    results.append(f"✗ {os.path.basename(tif)}: {e}")
                pbar.update(1)
    
    # 결과 출력
    for result in results:
        print(result)
    
    print(f"\n✓ Completed: {len(results)} files")


