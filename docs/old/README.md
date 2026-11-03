# DS Global DB Manager

골프장/잔디 관리 업체를 위한 약품, 장비, 인력 관리 및 일일 작업 기록 시스템입니다.

## 기술 스택

- **Frontend**: React 18 + Vite
- **UI**: Tailwind CSS + DaisyUI
- **상태관리**: React Context API
- **인증**: AWS Cognito (Amplify)
- **파일저장**: AWS S3
- **HTTP Client**: Axios

## 프로젝트 구조

```
src/
├── context/                 # 전역 상태 관리
│   ├── BaseContext.jsx      # 기본 설정 (등급, 조직, 타입 등)
│   ├── GlobalComponentContext.jsx  # 약품/장비/인력 데이터
│   └── DayRecordContext.jsx # 일일 작업 기록
├── DSChemical/              # 약품 관리
├── DSEquipment/             # 장비 관리
├── DSWorkforce/             # 인력 관리
├── DSBaseInfo/              # 기본 정보 설정
├── dsdbMain/                # DB 관리 메인
└── dsoutMain/               # 일일 작업 기록
```

## 문서 목록

- [데이터 모델 및 API 명세](./DATA_AND_API.md) - 데이터 종류와 API 엔드포인트 설명
- [방제 작업 모듈](./DS_WORK_MODULES.md) - DSWorkBaseInfo, DSWorkCourse, DSMapCourse 통합 문서
- [Lambda BaseInfo 분석](./LAMBDA_BASEINFO_ANALYSIS.md) - Lambda 함수 비교 분석 및 코드 개선안

