# DS Global DB Manager - 프로젝트 구조

## 개요

동성 그린 시스템의 글로벌 DB 관리 웹앱.
React 18 + Vite 기반, AWS Cognito 인증, S3 데이터 저장, API Gateway + Lambda 백엔드.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18.3, React Router v7.1, Vite |
| 스타일 | Tailwind CSS + DaisyUI |
| 인증 | AWS Amplify + Cognito (`us-east-1_W0IaBru9e`) |
| HTTP | Axios |
| 백엔드 | AWS API Gateway + Lambda (Python) |
| 저장소 | AWS S3 (`dsbaseinfo`, `dsgeousergrp`, `dsoutrecord`) |

---

## 폴더 구조

```
dsglobaldb_manager/
├── src/                          # React 앱 소스
│   ├── pages/
│   │   └── Layout.jsx            # 메인 레이아웃 (인증, 네비게이션, 앱 초기화)
│   ├── dsdbMain/
│   │   └── DSDBMain.jsx          # 메인 라우터 + 사이드바
│   ├── DSChemical/               # 약품 관리
│   │   ├── DSChemicalsTable.jsx
│   │   ├── AddChemicalDialog.jsx
│   │   └── EditChemicalDialog.jsx
│   ├── DSWorkforce/              # 인력 관리
│   │   ├── DSWorkforceTable.jsx
│   │   ├── AddWorkforceDialog.jsx
│   │   └── EditWorkforceDialog.jsx
│   ├── DSEquipment/              # 장비 관리
│   │   ├── DSEquipmentTable.jsx
│   │   ├── EditEquipmentDialog.jsx
│   │   └── ViewMaintenanceDialog.jsx
│   ├── DSBaseInfo/               # 기본정보 설정
│   │   └── BaseInfoManager.jsx
│   ├── DSMapCourse/              # 맵코스 관리
│   │   ├── DSMapCourse.jsx
│   │   └── CourseEditDialog.jsx
│   ├── DSWorkCourse/             # 방제작업코스 관리
│   │   ├── DSWorkCourse.jsx
│   │   └── WorkCourseEditDialog.jsx
│   ├── DSWorkBaseInfo/           # 방제기본정보 관리
│   │   └── DSWorkBaseInfo.jsx
│   ├── context/                  # 전역 상태 관리
│   │   ├── BaseContext.jsx
│   │   ├── GlobalComponentContext.jsx
│   │   ├── ComponentContext.jsx
│   │   └── DayRecordContext.jsx
│   └── components/               # 공통 컴포넌트
│       ├── DSInputs.jsx
│       ├── EditableButtonList.jsx
│       └── EditableObjectList.jsx
├── AWS/
│   └── BaseInfo/
│       ├── lambda/               # Lambda 함수
│       │   ├── DSGEOBaseInfoLambda.py
│       │   ├── DSWorkBaseInfo.py
│       │   ├── dsOutBaseinfo.py
│       │   └── dsOutBaseinfo_v2.py
│       ├── dsgreen/              # 공통 Python 헬퍼
│       │   └── aws_helpers.py
│       └── (AG0-0) Download and move to OUT.ipynb
├── styles/                       # 글로벌 CSS
└── docs/                         # 문서
```

---

## 라우팅 구조

```
/ ─── Layout.jsx (인증 + 초기화)
      └── /dsdb/* ─── DSDBMain.jsx (사이드바)
              ├── /dsdb/              → DSChemicalsTable  (약품정보)
              ├── /dsdb/workforce     → DSWorkforceTable  (인력정보)
              ├── /dsdb/equipment     → DSEquipmentTable  (장비정보)
              ├── /dsdb/baseinfo      → BaseInfoManager   (기본정보)
              ├── /dsdb/mapcourse     → DSMapCourse       (맵코스)
              ├── /dsdb/workcourse    → DSWorkCourse      (방제작업코스)
              └── /dsdb/workbaseinfo  → DSWorkBaseInfo    (방제기본정보)
```

---

## API Gateway 구성

이 프로젝트는 **3개의 API Gateway**를 사용합니다.

### Gateway A: `spcxatxbph` — GEO/Base 정보

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/baseinfo?mapdscourseid=` | GEO 기본정보 조회 |
| PUT | `/baseinfo` | GEO 기본정보 저장 |
| GET | `/dsoutwork?mapdscourseid=` | 일일기록 조회 |
| PUT | `/dsoutwork` | 일일기록 저장 |
| GET | `/dscourse` | 맵코스 조회 |
| PUT | `/dscourse` | 맵코스 수정 |

**Lambda:** `DSGEOBaseInfoLambda.py`

### Gateway B: `jyipsj28s9` — 글로벌 DB (약품/인력/장비)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/dschemical` | 약품 전체 조회 |
| POST | `/dschemical` | 약품 추가 |
| PUT | `/dschemical` | 약품 수정 |
| DELETE | `/dschemical?id=` | 약품 삭제 |
| GET | `/dsworkforce` | 인력 전체 조회 |
| POST | `/dsworkforce` | 인력 추가 |
| PUT | `/dsworkforce?mapdscourseid=` | 인력 수정 |
| DELETE | `/dsworkforce?id=` | 인력 삭제 |
| GET | `/equipment` | 장비 전체 조회 |
| POST | `/equipment` | 장비 추가 |
| PUT | `/equipment` | 장비 수정 |
| DELETE | `/equipment?id=` | 장비 삭제 |
| GET | `/maintenanceV2?mapdscourseid=` | 정비기록 조회 |
| POST | `/maintenanceV2` | 정비기록 추가/수정 |
| DELETE | `/maintenance?date=&equipment_id=` | 정비기록 삭제 |

### Gateway C: `e0x0fsw125` — 방제작업 정보

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/baseinfo` | 방제기본정보 조회 |
| PUT | `/baseinfo` | 방제기본정보 저장 |
| GET | `/dscourse_info` | 방제작업코스 조회 |
| PUT | `/dscourse_info` | 방제작업코스 수정 |

**Lambda:** `DSWorkBaseInfo.py`

---

## 페이지별 API 매핑

### 1. 약품정보 — DSChemicalsTable

| 기능 | API | Gateway |
|------|-----|---------|
| 목록 조회 | `GET /dschemical` | B |
| 추가 | `POST /dschemical` | B |
| 수정 | `PUT /dschemical` | B |
| 삭제 | `DELETE /dschemical?id=` | B |

**Context:** `GlobalComponentContext`
**필터:** infoL1, infoL2, infoL3, active, flgWork, flgOut

### 2. 인력정보 — DSWorkforceTable

| 기능 | API | Gateway |
|------|-----|---------|
| 목록 조회 | `GET /dsworkforce` | B |
| 추가 | `POST /dsworkforce` | B |
| 수정 | `PUT /dsworkforce` | B |
| 삭제 | `DELETE /dsworkforce?id=` | B |

**Context:** `GlobalComponentContext`
**필터:** org, category

### 3. 장비정보 — DSEquipmentTable

| 기능 | API | Gateway |
|------|-----|---------|
| 목록 조회 | `GET /equipment` | B |
| 추가 | `POST /equipment` | B |
| 수정 | `PUT /equipment` | B |
| 삭제 | `DELETE /equipment?id=` | B |
| 정비기록 조회 | `GET /maintenanceV2?mapdscourseid=` | B |
| 정비기록 추가 | `POST /maintenanceV2` | B |
| 정비기록 삭제 | `DELETE /maintenance?date=&equipment_id=` | B |
| 이미지 로드 | AWS Amplify Storage `getUrl()` | - |

**Context:** `GlobalComponentContext`
**필터:** category, type, org

### 4. 기본정보 — BaseInfoManager

| 기능 | API | Gateway |
|------|-----|---------|
| 조회 | `GET /baseinfo?mapdscourseid=` | A |
| 저장 | `PUT /baseinfo` | A |

**Context:** `BaseContext`
**관리 항목:**
- dsrankOrder, dsOrgOrder, dstypeOrder, dsEQtypeOrder
- 날씨 조건 (clear, precipitation, wind)
- dsHolidays, dsOrgList, dsTaskList

### 5. 맵코스 — DSMapCourse

| 기능 | API | Gateway |
|------|-----|---------|
| 조회 | `GET /dscourse` | A |
| 수정 | `PUT /dscourse` | A |

**Context:** `BaseContext`

### 6. 방제작업코스 — DSWorkCourse

| 기능 | API | Gateway |
|------|-----|---------|
| 조회 | `GET /dscourse_info` | C |
| 수정 | `PUT /dscourse_info` | C |

**Context:** 직접 axios 호출

### 7. 방제기본정보 — DSWorkBaseInfo

| 기능 | API | Gateway |
|------|-----|---------|
| 조회 | `GET /baseinfo` | C |
| 저장 | `PUT /baseinfo` | C |

**Context:** 직접 axios 호출
**관리 항목:** org_info, outsource_info, task_info, vehicle_info

---

## Context (전역 상태) 구조

### BaseContext → Gateway A

| 상태 | 설명 |
|------|------|
| `dsrankOrder` | 직급 순서 |
| `dsOrgOrder` | 조직 순서 |
| `dstypeOrder` | 유형 순서 |
| `dsEQtypeOrder` | 장비 유형 순서 |
| `dsEQCategoryTypeMAP` | 장비 카테고리→유형 매핑 |
| `dssclearConditions` | 날씨(맑음) 조건 |
| `dsprecipitationConditions` | 강수 조건 |
| `dswindConditions` | 풍속 조건 |
| `dsHolidays` | 공휴일 목록 |
| `dsOrgList` | 조직 목록 (org_ecnt, org, mapdscourseid) |
| `dsTaskList` | 작업 목록 |
| `mapdscourseid` | 현재 유저의 조직 코스 ID |

### GlobalComponentContext → Gateway B

| 상태 | 설명 |
|------|------|
| `globalChemicals` | 약품 DB |
| `globalEquipments` | 장비 DB |
| `globalWorkforces` | 인력 DB |
| `globalMaintenances` | 정비기록 |

### DayRecordContext → Gateway A

| 상태 | 설명 |
|------|------|
| `dayRecords` | 일일 작업기록 목록 |
| `selectedDayRecord` | 현재 선택된 기록 |

---

## Lambda 함수 비교

### S3 버킷: `dsbaseinfo`

```
dsbaseinfo/
├── common/           ← 3개 Lambda 공유
│   ├── dsOrgList.json
│   ├── dsworkcourse_info.json
│   └── mapcourse_info.json
├── geo/              ← DSGEOBaseInfoLambda 전용
├── outrecord/        ← dsOutBaseinfo 전용
└── work/             ← DSWorkBaseInfo 전용
    ├── org_info.json
    ├── outsource_info.json
    ├── task_info.json
    └── vehicle_info.json
```

| Lambda | GET 시 로드 | PUT 시 저장 |
|--------|-------------|-------------|
| `DSGEOBaseInfoLambda.py` | common/ + geo/ | common/ 또는 geo/ |
| `dsOutBaseinfo.py` | common/ + outrecord/ | common/ 또는 outrecord/ |
| `DSWorkBaseInfo.py` | common/ + work/ | common/ 또는 work/ |

3개 모두 저장 시 `dsOrgList`, `dsworkcourse_info`, `mapcourse_info` 키는 `common/`에 저장하고, 나머지는 각자의 폴더에 저장합니다.

---

## 데이터 흐름

```
Cognito 로그인
    │
    ▼
Layout.jsx → getUserInfo() → custom:org 속성 → mapdscourseid 결정
    │
    ▼
BaseContext.loadConfig(mapdscourseid) → GET /baseinfo (Gateway A)
    │
    ▼
mapdscourseid == 'MGC999' (admin) 인 경우:
    ├── fetchGlobalChemicals()   → GET /dschemical    (Gateway B)
    ├── fetchGlobalEquipments()  → GET /equipment     (Gateway B)
    └── fetchGlobalWorkforces()  → GET /dsworkforce   (Gateway B)
    │
    ▼
DSDBMain.jsx → 사이드바 메뉴 → 각 페이지 라우팅
    │
    ▼
각 페이지에서 Context를 통해 CRUD → API Gateway → Lambda → S3
```
