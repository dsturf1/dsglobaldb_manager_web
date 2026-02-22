# 데이터 모델 및 API 명세

이 문서는 시스템에서 사용하는 데이터 종류와 각 데이터를 가져오는 API를 설명합니다.

---

## API 기본 정보

### API Gateway 1 - 기본 설정 및 작업 기록
```
Base URL: https://spcxatxbph.execute-api.us-east-1.amazonaws.com/dev
```

### API Gateway 2 - 컴포넌트 관리 (약품/장비/인력/유지보수)
```
Base URL: https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev
```

---

## 1. 약품 (Chemical)

### 데이터 구조

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `dsids` | string | 약품 ID (예: A10001, 자동 생성) |
| `name` | string | 제품명 |
| `infoL3` | string | 중요도 (중요도1~5) |
| `infoL2` | string | 대분류 (농약, 비료, 기타약재, 잔디, 기타물품) |
| `infoL1` | string | 중분류 (살균제, 살충제, 제초제 등) |
| `unit` | string | 용량 단위 (예: "100g") |
| `IN_PRICE` | number | 구입가 |
| `OUT_PRICE` | number | 용역판가 |
| `OUT_PRICE1` | number | 판가 |
| `active` | string | 활성 상태 (Y/N) |
| `flgWork` | string | 작업 사용 여부 (Y/N) |
| `flgOut` | string | 외부 판매 여부 (Y/N) |

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/dschemical` | 전체 약품 목록 조회 |
| POST | `/dschemical` | 신규 약품 추가 |
| PUT | `/dschemical` | 약품 정보 수정 |
| DELETE | `/dschemical?id={id}` | 약품 삭제 |

### 사용 위치
- `GlobalComponentContext.jsx` - 데이터 fetch/CRUD
- `DSChemicalsTable.jsx` - 약품 목록 표시
- `AddChemicalDialog.jsx` - 약품 추가 다이얼로그
- `EditChemicalDialog.jsx` - 약품 수정 다이얼로그

---

## 2. 인력 (Workforce)

### 데이터 구조

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | string | 인력 ID (예: DS0000001, 자동 생성) |
| `name` | string | 이름 |
| `org` | string | 소속 조직 |
| `rank` | string | 직급 |
| `category` | string | 분류 (정규직, 계약직, 일용남, 일용여) |
| `Email` | string | 이메일 |
| `mapdscourseid` | string | 조직 ID |

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/dsworkforce` | 전체 인력 목록 조회 |
| POST | `/dsworkforce` | 신규 인력 추가 |
| PUT | `/dsworkforce?mapdscourseid={courseId}` | 인력 정보 수정 |
| DELETE | `/dsworkforce?id={id}` | 인력 삭제 |

### 사용 위치
- `GlobalComponentContext.jsx` - 데이터 fetch/CRUD
- `DSWorkforceTable.jsx` - 인력 목록 표시
- `AddWorkforceDialog.jsx` - 인력 추가 다이얼로그
- `EditWorkforceDialog.jsx` - 인력 수정 다이얼로그

---

## 3. 장비 (Equipment)

### 데이터 구조

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | string | 장비 ID (UUID) |
| `name` | string | 장비명 |
| `category` | string | 분류 (분무기, 주행기 등) |
| `type` | string | 유형 |
| `modelNumber` | string | 모델 번호 |
| `manufacturer` | string | 제조사 |
| `seller` | string | 판매처 |
| `purchaseDate` | string | 구입 날짜 |
| `cost` | number | 구입 비용 |
| `owner` | string | 소유자 |
| `location` | string | 위치 |
| `desc` | string | 설명 |
| `mapdscourseid` | string | 조직 ID |
| `imageURL` | string | 이미지 URL (S3) |
| `cat_symbol` | string | 카테고리 심볼 |
| `cat_order` | number | 카테고리별 순서 |

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/equipment` | 전체 장비 목록 조회 |
| POST | `/equipment` | 신규 장비 추가 |
| PUT | `/equipment` | 장비 정보 수정 |
| DELETE | `/equipment?id={id}` | 장비 삭제 |

### 이미지 저장
- **저장소**: AWS S3 (`dsoutrecord` 버킷)
- **경로**: `equipment-images/{equipmentId}.{ext}`
- **크기**: 192x256 자동 리사이즈

### 사용 위치
- `GlobalComponentContext.jsx` - 데이터 fetch/CRUD
- `DSEquipmentTable.jsx` - 장비 목록 표시
- `EditEquipmentDialog.jsx` - 장비 수정 다이얼로그

---

## 4. 유지보수 기록 (Maintenance)

### 데이터 구조

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | string | 유지보수 ID (UUID) |
| `equipment_id` | string | 장비 ID |
| `date` | string | 유지보수 날짜 |
| `description` | string | 설명 |
| `mapdscourseid` | string | 조직 ID |

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/maintenanceV2?mapdscourseid={courseId}` | 유지보수 이력 조회 |
| POST | `/maintenanceV2` | 유지보수 기록 추가/수정 |
| DELETE | `/maintenance?date={date}&equipment_id={id}` | 유지보수 기록 삭제 |

### 사용 위치
- `GlobalComponentContext.jsx` - 데이터 fetch/CRUD
- `ViewMaintenanceDialog.jsx` - 유지보수 이력 조회

---

## 5. 기본 설정 (BaseConfig)

### 데이터 구조

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `mapdscourseid` | string | 조직 ID |
| `dsrankOrder` | string[] | 직급 목록 |
| `dsOrgOrder` | string[] | 조직 목록 |
| `dstypeOrder` | string[] | 약품 타입 목록 |
| `dsEQtypeOrder` | string[] | 장비 타입 목록 |
| `dsEQtypeSymMap` | object | 장비 타입 심볼 매핑 |
| `dsEQCategoryTypeMAP` | object | 장비 카테고리별 타입 매핑 |
| `dssclearConditions` | string[] | 맑음 조건 |
| `dsprecipitationConditions` | string[] | 강수 조건 |
| `dswindConditions` | string[] | 바람 조건 |
| `dsholidays` | string[] | 휴일 목록 |
| `dsOrgList` | array | 조직 정보 목록 |
| `dstask` | object[] | 작업 목록 |

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/baseinfo?mapdscourseid={courseId}` | 기본 설정 조회 |
| PUT | `/baseinfo` | 기본 설정 업데이트 |

### 사용 위치
- `BaseContext.jsx` - 설정 데이터 로드 및 캐싱
- `BaseInfoManager.jsx` - 기본 정보 관리 UI

---

## 6. 일일 작업 기록 (DayRecord)

### 데이터 구조

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | string | 기록 ID (UUID) |
| `date` | string | 날짜 |
| `isodate` | string | ISO 형식 날짜 |
| `mapdscourseid` | string | 조직 ID |
| `status` | string | 상태 (planned, completed 등) |
| `records` | array | 작업 기록 배열 |
| `infos` | object | 추가 정보 (아래 참조) |
| `edited` | boolean | 편집 여부 |

### infos 객체 구조

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `tempLow` | number | 최저 기온 |
| `tempHigh` | number | 최고 기온 |
| `weather` | string | 날씨 |
| `teeoffTime` | string | 티오프 시간 |
| `mowingHeight` | object | 잔디 높이 (fw, green, rough, tee) |
| `guest` | array | 외부인 방문 정보 [수, 수, 수] |
| `attendance` | object | 인원 현황 |

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/dsoutwork?mapdscourseid={courseId}` | 일일 작업 기록 조회 |
| PUT | `/dsoutwork` | 일일 작업 기록 업데이트 |

### 사용 위치
- `DayRecordContext.jsx` - 일일 기록 데이터 관리
- `DSOutMain.jsx` - 일일 작업 기록 메인 UI
- `DayRecordTable.jsx` - 작업 기록 테이블

---

## 데이터 흐름도

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자 로그인                            │
│                      (AWS Cognito 인증)                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Layout.jsx - getUserInfo()                    │
│              사용자의 custom:org 속성으로 조직 ID 결정             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               BaseContext - loadConfig(mapdscourseid)            │
│                    GET /baseinfo API 호출                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GlobalComponentContext                        │
│         ┌──────────┬──────────┬──────────┬──────────┐           │
│         │  약품    │   장비   │   인력   │ 유지보수  │           │
│         │ Chemical │Equipment │Workforce │Maintenance│           │
│         └──────────┴──────────┴──────────┴──────────┘           │
│              GET /dschemical, /equipment, /dsworkforce           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       UI 컴포넌트 렌더링                          │
│         테이블 → 필터링 → 다이얼로그 → CRUD 작업                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 인증 및 권한

### AWS Cognito 설정
- **Identity Pool ID**: `us-east-1:067d6c97-a360-4f8d-bef4-e67fb16ec26c`
- **User Pool ID**: `us-east-1_W0IaBru9e`
- **Client ID**: `37udumbt9e7dtplc9mtpsggg4a`

### 조직 기반 데이터 분리
- 사용자의 `custom:org` 속성으로 `mapdscourseid` 결정
- `mapdscourseid === 'MGC999'`인 경우 전체 조직 데이터 접근 가능
- 각 API 호출 시 `mapdscourseid`로 데이터 필터링

---

## Context 구조

```
App
├── Authenticator (AWS Cognito)
├── BaseProvider           ← 기본 설정 정보
├── GlobalComponentProvider ← 약품/장비/인력/유지보수
├── DayRecordProvider      ← 일일 작업 기록
└── Layout                 ← 라우팅 및 네비게이션
```
