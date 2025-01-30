import React, { useState, useRef, useEffect } from 'react';
    // PriceInput 컴포넌트 수정
    const NumberInput = React.memo(({ value = 0, onChange ,className}) => {
      const [localValue, setLocalValue] = useState(value.toString());
      const inputRef = useRef(null);
  
      const handleChange = (e) => {
        // 숫자와 쉼표만 허용
        const sanitizedValue = e.target.value.replace(/[^\d,]/g, '');
        setLocalValue(sanitizedValue);
      };
  
      const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
          const numericValue = Number(localValue.replace(/,/g, ''));
          onChange(numericValue);
          inputRef.current?.blur();
        }
      };
  
      const handleBlur = () => {
        const numericValue = Number(localValue.replace(/,/g, ''));
        onChange(numericValue);
        setLocalValue(numericValue.toLocaleString());
      };
  
      // 외부 value가 변경되면 localValue 업데이트
      useEffect(() => {
        setLocalValue(value.toLocaleString());
      }, [value]);
  
      return (
        <input
          ref={inputRef}
          type="text"
          className={className}
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      );
    });
  
    // TextInput 컴포넌트 수정
    const TextInput = React.memo(({ value = '', onChange ,className}) => {
      const [localValue, setLocalValue] = useState(value);
      const inputRef = useRef(null);
  
      const handleChange = (e) => {
        setLocalValue(e.target.value);
      };
  
      const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
          onChange(localValue);
          inputRef.current?.blur();
        }
      };
  
      const handleBlur = () => {
        onChange(localValue);
      };
  
      useEffect(() => {
        setLocalValue(value);
      }, [value]);
  
      return (
        <input
          ref={inputRef}
          type="text"
          className={className}
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      );
    });
  
    // UnitInput 컴포넌트 수정
    const UnitInput = React.memo(({ value = '0ｇ', onChange ,className, classNameUnit}) => {
      // 단위 표준화 함수 추가
      const standardizeUnit = (unit) => {
        const unitMap = {
          'ton': 'Ton',
          'TON': 'Ton',
          'Ton': 'Ton',
          'ｇ': 'ｇ',
          'g': 'ｇ',
          '㎏': '㎏',
          'kg': '㎏',
          'KG': '㎏',
          '㎎': '㎎',
          'mg': '㎎',
          'ℓ': 'ℓ',
          'L': 'ℓ',
          'l': 'ℓ',
          '㎖': '㎖',
          'ml': '㎖',
          '㎡': '㎡',
          'm2': '㎡',
          'EA': 'EA',
          'ea': 'EA',
          '원': '원',
          '건': '건'
        };
        return unitMap[unit] || unit;
      };
  
      // 숫자와 단위 분리 - 숫자가 없는 경우도 처리
      const parseUnit = (str = '0ｇ') => {
        const match = str.toString().match(/^(\d*)(.*)$/);
        if (!match) return { number: '', unit: 'ｇ' };
        
        const number = match[1] === '' ? '' : parseInt(match[1]);
        const unit = standardizeUnit(match[2] || 'ｇ');  // 단위 표준화 적용
        return { number, unit };
      };
  
      const { number, unit } = parseUnit(value);
      const [localNumber, setLocalNumber] = useState(number);
      const inputRef = useRef(null);
  
      const handleNumberChange = (e) => {
        // 숫자만 허용
        const sanitizedValue = e.target.value.replace(/[^\d]/g, '');
        setLocalNumber(sanitizedValue);
      };
  
      const handleNumberKeyDown = (e) => {
        if (e.key === 'Enter') {
          const finalValue = localNumber === '' ? unit : `${localNumber}${unit}`;
          onChange(finalValue);
          inputRef.current?.blur();
        }
      };
  
      const handleNumberBlur = () => {
        const finalValue = localNumber === '' ? unit : `${localNumber}${unit}`;
        onChange(finalValue);
      };
  
      const handleUnitChange = (newUnit) => {
        const finalValue = localNumber === '' ? newUnit : `${localNumber}${newUnit}`;
        onChange(finalValue);
      };
  
      useEffect(() => {
        const { number: newNumber } = parseUnit(value);
        setLocalNumber(newNumber);
      }, [value]);
  
      return (
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="text"
            className={className}
            value={localNumber}
            onChange={handleNumberChange}
            onKeyDown={handleNumberKeyDown}
            onBlur={handleNumberBlur}
          />
          <select
            className={classNameUnit}
            value={unit}
            onChange={(e) => handleUnitChange(e.target.value)}
          >
            <option value="Ton">Ton</option>
            <option value="㎏">㎏</option>
            <option value="ｇ">ｇ</option>
            <option value="㎎">㎎</option>
            <option value="ℓ">ℓ</option>
            <option value="㎖">㎖</option>
            <option value="㎡">㎡</option>
            <option value="EA">EA</option>
            <option value="원">원</option>
            <option value="건">건</option>
          </select>
        </div>
      );
    });

    const formatUTCToLocal = (utcDateString) => {
      const date = new Date(utcDateString); // UTC 시간으로 Date 객체 생성
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0'); // 월은 0부터 시작하므로 +1
      const day = String(date.getDate()).padStart(2, '0');
    
      return `${year}-${month}-${day}`;
    };

    // UTC 날짜 문자열을 로컬 날짜 문자열로 변환


    // 로컬 날짜 문자열을 UTC 날짜 문자열로 변환
    const formatLocalToUTC = (localDate) => {
      if (!localDate) return '';
      const date = new Date(localDate);
      return date.toISOString();
    };

    export { NumberInput, TextInput, UnitInput, formatUTCToLocal, formatLocalToUTC };