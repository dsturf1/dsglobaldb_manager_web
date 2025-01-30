import React, { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getUrl, uploadData } from 'aws-amplify/storage';
import { useGlobalComponent } from '../context/ComponentContext';
import { useBase } from '../context/BaseContext';
import { NumberInput, TextInput, UnitInput, formatUTCToLocal, formatLocalToUTC } from '../components/DSInputs';
import defaultImage from '../assets/logo192.png';

// 이미지 리사이즈 및 포맷 변환 유틸리티
const processImage = async (file) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 256, 192);
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    };
    img.src = URL.createObjectURL(file);
  });
};

export default function EditEquipmentDialog({ isOpen, onClose, equipment, isAdd }) {
  const { updateGlobalEquipment, addGlobalEquipment, globalEquipments } = useGlobalComponent();
  const { dsOrgList } = useBase();
  const [form, setForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [useDefaultImage, setUseDefaultImage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [pendingImage, setPendingImage] = useState(null);

  // 카테고리와 타입의 unique한 조합 추출
  const categoryTypeMap = useMemo(() => {
    const map = new Map();
    globalEquipments.forEach(eq => {
      if (!map.has(eq.category)) {
        map.set(eq.category, new Set());
      }
      map.get(eq.category).add(eq.type);
    });

    // Map을 객체로 변환
    return Array.from(map).reduce((obj, [category, types]) => {
      obj[category] = Array.from(types);
      return obj;
    }, {});
  }, [globalEquipments]);

  // 현재 선택 가능한 모든 카테고리
  const categories = useMemo(() => 
    Object.keys(categoryTypeMap)
  , [categoryTypeMap]);

  // S3에서 이미지 가져오기
  const fetchImage = async (mapdscourseid, id) => {
    if (!mapdscourseid || !id) {
      setUseDefaultImage(true);
      return;
    }
    
    try {
      const { url } = await getUrl({
        path: `public/equipment/${mapdscourseid}/${id}.png`,
        options: {
          cacheControl: 'no-cache',
          expiresIn: 60,
          validateObjectExistence: true
        }
      });
      setImageUrl(url);
      setUseDefaultImage(false);
    } catch (error) {
      console.error('Error fetching image:', error);
      setImageUrl(null);
      setUseDefaultImage(true);
    }
  };

  // 이미지 로드 에러 처리
  const handleImageError = (e) => {
    setUseDefaultImage(true);
  };

  // 모달이 닫힐 때 상태 초기화
  const handleClose = () => {
    setImageUrl(null);
    setUseDefaultImage(false);
    setPendingImage(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      setImageUrl(null);
      setUseDefaultImage(false);
      return;
    }

    console.log('Modal opened with equipment:', {
      isAdd,
      equipment,
      form
    });

    if (equipment) {
      setForm(equipment);
      if (!isAdd && equipment.id && equipment.mapdscourseid) {
        fetchImage(equipment.mapdscourseid, equipment.id);
      } else {
        setUseDefaultImage(true);
      }
    }
  }, [equipment, isAdd, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      alert('장비명은 필수 입력 항목입니다.');
      return;
    }

    if (!form.mapdscourseid?.trim()) {
      alert('담당부서는 필수 입력 항목입니다.');
      return;
    }
    
    setIsSaving(true);
    try {
      if (isAdd) {
        const newEquipment = {
          ...form,
          id: uuidv4()
        };
        await addGlobalEquipment(newEquipment);
        if (pendingImage && newEquipment.mapdscourseid) {
          const result = await uploadData({
            path: `public/equipment/${newEquipment.mapdscourseid}/${newEquipment.id}.png`,
            data: pendingImage,
            options: {
              contentType: 'image/png'
            }
          }).result;
          console.log('Succeeded: ', result);
        }
      } else {
        if (equipment.mapdscourseid !== form.mapdscourseid) {
          if (pendingImage) {
            const result = await uploadData({
              path: `public/equipment/${form.mapdscourseid}/${form.id}.png`,
              data: pendingImage,
              options: {
                contentType: 'image/png'
              }
            }).result;
            console.log('New image uploaded:', result);
          } else if (!useDefaultImage) {
            try {
              const { url } = await getUrl({
                path: `public/equipment/${equipment.mapdscourseid}/${form.id}.png`,
                options: {
                  validateObjectExistence: true
                }
              });
              
              const response = await fetch(url);
              const blob = await response.blob();
              
              const result = await uploadData({
                path: `public/equipment/${form.mapdscourseid}/${form.id}.png`,
                data: blob,
                options: {
                  contentType: 'image/png'
                }
              }).result;
              console.log('Existing image moved to new path:', result);
            } catch (error) {
              console.error('Failed to move image:', error);
            }
          }
        } else if (pendingImage) {
          const result = await uploadData({
            path: `public/equipment/${form.mapdscourseid}/${form.id}.png`,
            data: pendingImage,
            options: {
              contentType: 'image/png'
            }
          }).result;
          console.log('New image uploaded:', result);
        }
        await updateGlobalEquipment(form);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
      setPendingImage(null);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'purchaseDate') {
      setForm(prev => ({
        ...prev,
        [name]: formatLocalToUTC(value)
      }));
      return;
    }
    setForm(prev => ({
      ...prev,
      [name]: name === 'cost' ? Number(value) : value
    }));
  };

  // 이미지 업로드 처리
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }
    
    try {
      const processedBlob = await processImage(file);
      setPendingImage(processedBlob);
      const previewUrl = URL.createObjectURL(processedBlob);
      setImageUrl(previewUrl);
      setUseDefaultImage(false);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('이미지 업로드 중 오류가 발생했습니다.');
    }
  };

  if (!isOpen || !form) return null;

  return (
    <dialog className={`modal ${isOpen ? 'modal-open' : ''}`}>
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-lg mb-4">
          {isAdd ? '신규 장비 등록' : '장비 정보 수정'}
        </h3>
        <div className="mb-4 flex flex-col items-center">
          <img
            src={pendingImage ? imageUrl : (useDefaultImage ? defaultImage : imageUrl)}
            alt="장비 이미지"
            className="max-h-64 object-contain rounded-lg shadow-md"
            onError={handleImageError}
          />
          <div className="mt-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/jpeg,image/png"
              onChange={handleImageUpload}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  업로드 중...
                </>
              ) : (
                isAdd ? '이미지 선택' : '이미지 수정'
              )}
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">분류</label>
              <select
                className="input input-bordered w-full"
                value={form.category}
                onChange={(e) => {
                  setForm(prev => ({
                    ...prev,
                    category: e.target.value,
                    type: categoryTypeMap[e.target.value]?.[0] || '' // 카테고리 변경 시 첫 번째 타입 선택
                  }));
                }}
              >
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">유형</label>
              <select
                className="input input-bordered w-full"
                value={form.type}
                onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
              >
                {categoryTypeMap[form.category]?.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">장비명</label>
              <TextInput
                name="name"
                value={form.name}
                onChange={(e) => {
                  setForm(prev => ({ ...prev, name: e }));
                }}
                className="input input-bordered w-full"
                required
              />
            </div>
            <div>
              <label className="label">모델번호</label>
              <TextInput
                name="modelNumber"
                value={form.modelNumber}
                onChange={(e) => setForm(prev => ({ ...prev, modelNumber: e }))}
                className="input input-bordered w-full"
              />
            </div>
            <div>
              <label className="label">제조사</label>
              <TextInput
                name="manufacturer"
                value={form.manufacturer}
                onChange={(e) => setForm(prev => ({ ...prev, manufacturer: e }))}
                className="input input-bordered w-full"
              />
            </div>
            <div>
              <label className="label">구매처</label>
              <TextInput
                name="seller"
                value={form.seller}
                onChange={(e) => setForm(prev => ({ ...prev, seller: e }))}
                className="input input-bordered w-full"
              />
            </div>
            <div>
              <label className="label">구매일자</label>
              <input
                type="date"
                name="purchaseDate"
                className="input input-bordered w-full"
                value={formatUTCToLocal(form.purchaseDate)}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="label">구매가격</label>
              <NumberInput
                value={form.cost}
                onChange={(e) => setForm(prev => ({ ...prev, cost: Number(e) }))}
                className="input input-bordered w-full text-right"
              />
            </div>
            <div>
              <label className="label">소유자</label>
              <TextInput
                name="owner"
                value={form.owner}
                onChange={(e) => setForm(prev => ({ ...prev, owner: e}))}
                className="input input-bordered w-full"
              />
            </div>
            <div>
              <label className="label">담당 부서</label>
              <select
                className="input input-bordered w-full"
                value={form.mapdscourseid || ''}
                onChange={(e) => setForm(prev => ({ 
                  ...prev, 
                  mapdscourseid: e.target.value 
                }))}
              >
                <option value="">선택하세요</option>
                {dsOrgList.map(org => (
                  <option key={org.org_ecnt} value={org.mapdscourseid}>
                    {org.org}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">설명</label>
              <TextInput
                name="desc"
                value={form.desc}
                onChange={(e) => setForm(prev => ({ ...prev, desc: e }))}
                className="input input-bordered w-full"
              />
            </div>
          </div>
          
          <div className="modal-action">
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  저장 중...
                </>
              ) : (
                isAdd ? '등록' : '저장'
              )}
            </button>
            <button 
              type="button" 
              className="btn" 
              onClick={handleClose}
              disabled={isSaving}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
} 