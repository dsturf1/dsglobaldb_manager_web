"""
Raster processing helper functions for golf course hole extraction.

Functions:
- Azimuth calculation for geometry rotation
- Raster rotation and transformation
- Single hole extraction from GeoTIFF
- Course image combination
"""

import os
import math
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.io import MemoryFile
import rasterio.mask
from affine import Affine
from shapely import affinity
from PIL import Image, ImageDraw, ImageFont


# =============================================================================
# Azimuth / Geometry Functions
# =============================================================================

def _azimuth(point1, point2):
    """Calculate azimuth between 2 points (interval 0 - 360 degrees)

    Args:
        point1: [x, y] coordinates of first point
        point2: [x, y] coordinates of second point

    Returns:
        Azimuth angle in degrees (0-360)
    """
    angle = np.arctan2(point2[0] - point1[0], point2[1] - point1[1])
    return np.degrees(angle) if angle > 0 else np.degrees(angle) + 360


def _dist(a, b):
    """Calculate distance between two points

    Args:
        a: (x, y) tuple of first point
        b: (x, y) tuple of second point

    Returns:
        Euclidean distance
    """
    return math.hypot(b[0] - a[0], b[1] - a[1])


def azimuth(mrr):
    """Calculate azimuth of minimum_rotated_rectangle

    Args:
        mrr: Shapely polygon (minimum rotated rectangle)

    Returns:
        Azimuth angle in degrees
    """
    bbox = list(mrr.exterior.coords)
    axis1 = _dist(bbox[0], bbox[3])
    axis2 = _dist(bbox[0], bbox[1])

    if axis1 <= axis2:
        az = _azimuth(bbox[0], bbox[1])
    else:
        az = _azimuth(bbox[0], bbox[3])

    return az


def check_rotate(geom):
    """Check and correct rotation angle based on hole-to-green direction

    Args:
        geom: Row with 'az' and 'az2' columns

    Returns:
        Corrected azimuth angle
    """
    if abs(geom['az'] - geom['az2']) < 150.:
        return geom['az']
    else:
        return geom['az'] - 180.


# =============================================================================
# Raster Rotation Functions
# =============================================================================

def get_center_pixel(dataset):
    """Get the pixel coordinates of the raster center

    Args:
        dataset: rasterio dataset object

    Returns:
        (x_pixel, y_pixel) tuple of center coordinates
    """
    width, height = dataset.width, dataset.height
    x_pixel_med = width // 2
    y_pixel_med = height // 2
    return (x_pixel_med, y_pixel_med)


def rotate_raster(in_file, out_file, angle, shift_x=0, shift_y=0, adj_width=0, adj_height=0):
    """Rotate a raster image and save it to disk (original size)

    Args:
        in_file: path to input raster file
        out_file: path to output raster file
        angle: angle of rotation in degrees
        shift_x: shift in x direction
        shift_y: shift in y direction
        adj_width: adjust width of output raster
        adj_height: adjust height of output raster
    """
    with rasterio.open(in_file) as src:
        src_transform = src.transform
        crs = src.crs
        pivot = get_center_pixel(src)
        shift_x = -src.width/2
        shift_y = src.height/2

        rotate = Affine.rotation(angle, pivot)
        trans_x = Affine.translation(shift_x, 0)
        trans_y = Affine.translation(0, -shift_y)
        dst_transform = src_transform * rotate * trans_x * trans_y

        band = np.array(src.read(1))
        y, x = band.shape
        dst_height = y
        dst_width = x

        dst_kwargs = src.meta.copy()
        dst_kwargs.update({
            "transform": dst_transform,
            "height": dst_height,
            "width": dst_width,
            "nodata": 0,
        })

        with rasterio.open(out_file, "w", **dst_kwargs) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=dst_transform,
                    dst_crs=crs,
                    resampling=Resampling.nearest)


def rotate_raster_2X(in_file, out_file, angle, shift_x=0, shift_y=0, adj_width=0, adj_height=0):
    """Rotate a raster image and save it to disk (2x size)

    Args:
        in_file: path to input raster file
        out_file: path to output raster file
        angle: angle of rotation in degrees
        shift_x: shift in x direction
        shift_y: shift in y direction
        adj_width: adjust width of output raster
        adj_height: adjust height of output raster
    """
    with rasterio.open(in_file) as src:
        src_transform = src.transform
        crs = src.crs
        pivot = get_center_pixel(src)
        shift_x = -src.width/2
        shift_y = src.height/2

        rotate = Affine.rotation(angle, pivot)
        trans_x = Affine.translation(shift_x, 0)
        trans_y = Affine.translation(0, -shift_y)
        dst_transform = src_transform * rotate * trans_x * trans_y

        band = np.array(src.read(1))
        y, x = band.shape
        dst_height = 2 * y
        dst_width = 2 * x

        dst_kwargs = src.meta.copy()
        dst_kwargs.update({
            "transform": dst_transform,
            "height": dst_height,
            "width": dst_width,
            "nodata": 0,
        })

        with rasterio.open(out_file, "w", **dst_kwargs) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=dst_transform,
                    dst_crs=crs,
                    resampling=Resampling.nearest)


# =============================================================================
# Hole Extraction Functions
# =============================================================================

def process_single_hole(row_data, raster_path, out_folder, scale_factor=1.2):
    """Process a single hole - extract rotated hole image from raster

    Args:
        row_data: tuple of (index, row) from gdf_hole_only.iterrows()
        raster_path: path to input GeoTIFF
        out_folder: output folder for PNG files
        scale_factor: scale factor for bounding box (default 1.2)

    Returns:
        String with processed hole info (e.g., "COURSE[1]홀영역")
    """
    index, row = row_data

    shape = affinity.scale(
        row['geometry'].minimum_rotated_rectangle,
        xfact=scale_factor,
        yfact=scale_factor,
        origin='center'
    )

    with rasterio.open(raster_path) as src:
        src_transform = src.transform
        crs = src.crs

        width, height = src.width, src.height
        pivot = (width // 2, height // 2)
        shift_x = -width / 2
        shift_y = height / 2

        rotate = Affine.rotation(row['az'], pivot)
        trans_x = Affine.translation(shift_x, 0)
        trans_y = Affine.translation(0, -shift_y)
        dst_transform = src_transform * rotate * trans_x * trans_y

        dst_height = 2 * height
        dst_width = 2 * width

        rotated_image = np.zeros((src.count, dst_height, dst_width), dtype=src.dtypes[0])

        for i in range(1, src.count + 1):
            reproject(
                source=rasterio.band(src, i),
                destination=rotated_image[i-1],
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=dst_transform,
                dst_crs=crs,
                resampling=Resampling.nearest
            )

        mem_kwargs = src.meta.copy()
        mem_kwargs.update({
            "transform": dst_transform,
            "height": dst_height,
            "width": dst_width,
            "nodata": 0,
        })

        with MemoryFile() as memfile:
            with memfile.open(**mem_kwargs) as mem_dataset:
                mem_dataset.write(rotated_image)
                out_image, out_transform = rasterio.mask.mask(mem_dataset, [shape], crop=True)

    # Convert to PIL Image format
    if out_image.shape[0] >= 3:
        rgb_image = np.transpose(out_image[:3], (1, 2, 0))
        pil_image = Image.fromarray(rgb_image.astype(np.uint8))
    else:
        pil_image = Image.fromarray(out_image[0].astype(np.uint8))

    # Save as PNG
    png_filename = os.path.join(out_folder, f"{row['Course']}[{row['Hole']}]{row['Type']}.png")
    pil_image.save(png_filename, optimize=True)

    return f"{row['Course']}[{row['Hole']}]{row['Type']}"


# =============================================================================
# Course Image Combination Functions
# =============================================================================

def create_course_combined_image(course_name, gdf_holes, out_folder):
    """Combine all hole images for a course into one horizontal image

    Args:
        course_name: Name of the course to process
        gdf_holes: GeoDataFrame with hole data
        out_folder: Output folder path

    Returns:
        Combined PIL Image object
    """
    # Filter and sort holes for this course
    course_holes = gdf_holes[gdf_holes['Course'] == course_name].sort_values('Hole').reset_index(drop=True)

    if len(course_holes) == 0:
        print(f"코스 '{course_name}'에 대한 홀이 없습니다.")
        return None

    print(f"\n=== {course_name} 코스 합치기 ===")
    print(f"총 {len(course_holes)}개 홀")

    # Load images and calculate areas
    hole_images = []
    hole_areas = []
    hole_info = []

    for idx, row in course_holes.iterrows():
        img_filename = os.path.join(out_folder, f"{row['Course']}[{row['Hole']}]{row['Type']}.png")

        if os.path.exists(img_filename):
            img = Image.open(img_filename)
            hole_images.append(img)

            # Calculate area in square meters (approximate lat/lon to meters conversion)
            area = row['geometry'].area * (111000 ** 2)
            hole_areas.append(area)

            hole_info.append({
                'hole': row['Hole'],
                'width': img.size[0],
                'height': img.size[1],
                'area': area
            })

            print(f"홀 {row['Hole']}: {img.size[0]}x{img.size[1]}px, 면적: {area:,.0f}㎡")
        else:
            print(f"이미지 없음: {img_filename}")

    if not hole_images:
        print("로드할 이미지가 없습니다.")
        return None

    # Normalize heights based on area ratios
    min_area = min(hole_areas)
    area_ratios = [area / min_area for area in hole_areas]
    base_height = min(img.size[1] for img in hole_images)

    # Resize images based on area ratios
    resized_images = []
    total_width = 0
    max_height = 0

    for i, (img, ratio) in enumerate(zip(hole_images, area_ratios)):
        scale_factor = np.sqrt(ratio)

        new_width = int(img.size[0] * scale_factor * base_height / img.size[1])
        new_height = int(base_height * scale_factor)

        resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        resized_images.append(resized_img)

        total_width += new_width
        max_height = max(max_height, new_height)

        print(f"홀 {hole_info[i]['hole']} 조정: {new_width}x{new_height}px (비율: {scale_factor:.2f})")

    # Create combined image
    combined_img = Image.new('RGB', (total_width, max_height), color='white')

    # Place each hole image
    current_x = 0
    for i, img in enumerate(resized_images):
        y_offset = (max_height - img.size[1]) // 2
        combined_img.paste(img, (current_x, y_offset))

        # Add hole number text
        draw = ImageDraw.Draw(combined_img)

        try:
            font = ImageFont.truetype("arial.ttf", 24)
        except:
            font = ImageFont.load_default()

        hole_num = hole_info[i]['hole']
        text = f"#{hole_num}"

        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_x = current_x + (img.size[0] - text_width) // 2
        text_y = max_height - 30

        # Text background
        bg_padding = 5
        draw.rectangle([
            text_x - bg_padding, text_y - bg_padding,
            text_x + text_width + bg_padding, text_y + 25
        ], fill=(0, 0, 0, 128))

        # White text
        draw.text((text_x, text_y), text, fill='white', font=font)

        current_x += img.size[0]

    # Save combined image
    output_filename = os.path.join(out_folder, f"{course_name}_코스_합치기.png")
    combined_img.save(output_filename, optimize=True)

    print(f"\n완성: {output_filename}")
    print(f"최종 크기: {combined_img.size[0]}x{combined_img.size[1]}px")

    return combined_img


def process_all_courses(gdf_hole_only, out_folder):
    """Process all courses and create combined images

    Args:
        gdf_hole_only: GeoDataFrame with hole data
        out_folder: Output folder path
    """
    courses = gdf_hole_only['Course'].unique()
    print(f"발견된 코스: {courses}")

    for course in courses:
        create_course_combined_image(course, gdf_hole_only, out_folder)

    print("\n모든 코스 합치기 완료!")
