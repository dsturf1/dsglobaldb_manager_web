# baseinfo_S3_old 폴더 구조 및 파일 설명

## 폴더 개요

| 폴더      | 파일 수 | 설명                                           |
| --------- | ------- | ---------------------------------------------- |
| common    | 3       | 공통 정보 (조직, 골프장 코스 정보)             |
| geo       | 6       | 지리/영역 정보 (영역 정의, 라벨, 잔디 타입)    |
| outrecord | 12      | 작업 기록 관련 정보 (장비, 날씨, 작업 조건 등) |
| work      | 4       | 작업 관리 정보 (조직, 외주, 작업, 차량)        |

## 전체 파일 목록

| 폴더      | 파일명                         | Key                                        |
| --------- | ------------------------------ | ------------------------------------------ |
| common    | dsOrgList.json                 | `org_ecnt`, `org`, `mapdscourseid` |
|           | dsworkcourse_info.json         | `dscourseids`, `name`, `org`, `dedicated_org`, `active`, `warehouse`, `outsource`, `outorg`, `outwarehouse`, `course_names`, `access_org`, `mapdscourseid` |
|           | mapcourse_info.json            | `id`, `dscourseids`, `name`, `address`, `numHole`, `course_names`, `map_info`, `access_org`, `numCourses`, `holesPerCourse` |
| geo       | area_def.json                  | `TypeId`, `name`, `color`, `display`, `area_def`, `work_def`, `DSZindex` |
|           | label_info.json                | `TypeId`, `L1`, `L2`, `L3` |
|           | label_infoL2.json              | `TypeId`, `L1`, `L2` |
|           | tmp_mapcourse_info.json        | (mapcourse_info.json과 동일) |
|           | tmp_mapdscourse_info.json      | `id`, `dscourseids`, `name`, `address`, `numHole`, `course_names`, `map_info`, `dsmapcourseid`, `bbox` |
|           | turf_type.json                 | `TypeId`, `turf_type` |
| outrecord | dsEQCategoryTypeMAP.json       | `예지장비`, `갱신장비`, `배토장비`, `시약장비`, `기타장비`, `범용장비` |
|           | dsEQtypeOrder.json             | (배열: 장비 카테고리 순서) |
|           | dsEQtypeSymMap.json            | `예지장비`, `갱신장비`, `배토장비`, `시약장비`, `기타장비`, `범용장비` |
|           | dsOrgList.json                 | `org_ecnt`, `org`, `mapdscourseid` |
|           | dsOrgOrder.json                | (배열: 조직 표시 순서) |
|           | dsholidays.json                | (배열: 휴일 날짜 목록) |
|           | dsprecipitationConditions.json | (배열: 강수 조건 목록) |
|           | dsrankOrder.json               | (배열: 직급 순서) |
|           | dssclearConditions.json        | (배열: 날씨 조건 목록) |
|           | dstask.json                    | `category`, `Task`, `area`, `courseNames`, `start_row` |
|           | dstypeOrder.json               | (배열: 약품 타입 순서) |
|           | dswindConditions.json          | (배열: 바람 조건 목록) |
| work      | org_info.json                  | `id`, `OrgCode`, `name` |
|           | outsource_info.json            | `dsids`, `name`, `unit`, `type`, `infoL1`, `infoL2`, `infoL3`, `flgWork`, `flgOut`, `flgSell` |
|           | task_info.json                 | `dsids`, `name`, `unit`, `type`, `infoL1`, `infoL2`, `infoL3`, `flgWork`, `flgOut` |
|           | vehicle_info.json              | `dsids`, `name`, `unit`, `type`, `infoL1`, `infoL2`, `infoL3`, `flgWork`, `flgOut`, `flgSell` |

---

## common 폴더

### dsOrgList.json

| 키                | 설명                                     |
| ----------------- | ---------------------------------------- |
| `org_ecnt`      | 조직 코드 (예: H001, O001, P001)         |
| `org`           | 조직명 (예: 본사, 용역-올림픽, 중부방제) |
| `mapdscourseid` | 매핑된 골프장 코스 ID                    |

**설명:** 조직(본사, 용역, 방제팀) 목록과 해당 골프장 매핑 정보

---

### dsworkcourse_info.json

| 키                     | 설명                              |
| ---------------------- | --------------------------------- |
| `dscourseids`        | 골프장 코스 ID (예: GC001)        |
| `name`               | 골프장 이름                       |
| `org`                | 담당 조직                         |
| `dedicated_org`      | 전담 조직                         |
| `active`             | 활성 여부 (Y/N/null)              |
| `warehouse`          | 창고 위치                         |
| `outsource`          | 용역 여부                         |
| `outorg`             | 용역 조직명                       |
| `outwarehouse`       | 용역 창고                         |
| `course_names`       | 코스 이름 배열                    |
| `course_namesString` | 코스 이름 (콤마 구분 문자열)      |
| `access_org`         | 접근 가능 조직 배열               |
| `access_orgString`   | 접근 가능 조직 (콤마 구분 문자열) |
| `mapdscourseid`      | 매핑 코스 ID (선택적)             |

**설명:** 작업 대상 골프장 코스 상세 정보 (99개 골프장)

---

### mapcourse_info.json

| 키                 | 설명                              |
| ------------------ | --------------------------------- |
| `id`             | 맵 코스 ID (예: MGC001)           |
| `dscourseids`    | 연결된 작업 코스 ID               |
| `name`           | 골프장 이름                       |
| `address`        | 주소                              |
| `numHole`        | 홀 수                             |
| `course_names`   | 코스 이름 배열                    |
| `map_info`       | 지도 정보 (center, level, bounds) |
| `access_org`     | 접근 가능 조직                    |
| `numCourses`     | 코스 수                           |
| `holesPerCourse` | 코스당 홀 수                      |

**설명:** 지도 표시용 골프장 코스 정보

---

## geo 폴더

### area_def.json

| 키           | 설명                                            |
| ------------ | ----------------------------------------------- |
| `TypeId`   | 영역 타입 ID (0~100)                            |
| `name`     | 영역 이름 (전면, 코스, 홀영역, 그린, 티박스 등) |
| `color`    | 표시 색상 (HEX)                                 |
| `display`  | 표시 여부                                       |
| `area_def` | 영역 정의 여부                                  |
| `work_def` | 작업 정의 여부                                  |
| `DSZindex` | Z-index 순서                                    |

**설명:** 골프장 영역 타입 정의 (12개 타입: 전면, 코스, 홀영역, 그린, 티박스, 훼어웨이 등)

---

### label_info.json

| 키         | 설명                                                |
| ---------- | --------------------------------------------------- |
| `TypeId` | 라벨 타입 ID                                        |
| `L1`     | 1단계 분류 (건강한잔디, 물리피해, 충해, 병해, 잡초) |
| `L2`     | 2단계 분류                                          |
| `L3`     | 3단계 분류 (상세 명칭)                              |

**설명:** 잔디 상태 및 피해 라벨 정보 (60개 항목: 건강한잔디, 물리피해, 충해, 병해, 잡초 등)

---

### label_infoL2.json

| 키         | 설명         |
| ---------- | ------------ |
| `TypeId` | 라벨 타입 ID |
| `L1`     | 1단계 분류   |
| `L2`     | 2단계 분류   |

**설명:** 2단계까지만 있는 간소화된 라벨 정보 (52개 항목)

---

### tmp_mapcourse_info.json

**설명:** mapcourse_info.json과 동일한 구조의 임시 파일

---

### tmp_mapdscourse_info.json

| 키                | 설명                             |
| ----------------- | -------------------------------- |
| `id`            | 임시 골프장 코스 ID (예: TGC001) |
| `dscourseids`   | 작업 코스 ID                     |
| `name`          | 골프장 이름                      |
| `address`       | 주소                             |
| `numHole`       | 홀 수                            |
| `course_names`  | 코스 이름 배열                   |
| `map_info`      | 지도 정보                        |
| `dsmapcourseid` | 매핑된 맵 코스 ID                |
| `bbox`          | 경계 박스                        |

**설명:** 임시 맵 코스 정보 (44개 골프장)

---

### turf_type.json

| 키            | 설명               |
| ------------- | ------------------ |
| `TypeId`    | 잔디 타입 ID (1~5) |
| `turf_type` | 잔디 종류명        |

**설명:** 잔디 타입 정의

- 1: 한국잔디
- 2: 벤트그래스
- 3: 켄터키블루그래스
- 4: 라이그래스
- 5: 버뮤다그래스

---

## outrecord 폴더

### dsEQCategoryTypeMAP.json

| 키           | 설명                                                         |
| ------------ | ------------------------------------------------------------ |
| `예지장비` | 3갱모아, 로타리모아, 플라잉모아, 그린모아, 5갱모아, 기타예지 |
| `갱신장비` | 에어레이터, 관리기, 컷터, 기타갱신                           |
| `배토장비` | 자주식배토기, 소토사배토기, 기타배토                         |
| `시약장비` | 시비-시약차량, 관주기, 입제비료살포기, 기타시약              |
| `기타장비` | 스키로더, 소드컷터, 파종기, 스위퍼 등                        |
| `범용장비` | 굴삭기, 크레인, 트럭, 작업차, 카트 등                        |

**설명:** 장비 카테고리별 장비 타입 매핑

---

### dsEQtypeOrder.json

**설명:** 장비 카테고리 순서 배열
`["예지장비", "갱신장비", "배토장비", "시약장비", "기타장비", "범용장비"]`

---

### dsEQtypeSymMap.json

| 키           | 값  |
| ------------ | --- |
| `예지장비` | MOW |
| `갱신장비` | AIR |
| `배토장비` | SND |
| `시약장비` | SPR |
| `기타장비` | ETC |
| `범용장비` | GEN |

**설명:** 장비 카테고리 약어 매핑

---

### dsOrgList.json

**설명:** common/dsOrgList.json과 동일한 구조

---

### dsOrgOrder.json

**설명:** 조직 표시 순서 배열
`["본사", "남부방제", "중부방제", "용역-그레이스", "용역-포항", ...]`

---

### dsholidays.json

**설명:** 휴일 목록 (2025~2026년 공휴일 날짜 배열)

---

### dsprecipitationConditions.json

**설명:** 강수 조건 배열
`["비 없음", "비", "가랑비", "소나기", "폭우", "집중호우", "눈", "가랑눈", "폭설", "진눈깨비", "눈비혼용"]`

---

### dsrankOrder.json

**설명:** 직급 순서 배열
`["이사", "부장", "차장", "과장", "주임", "사원", "계약직", "일용남", "일용여"]`

---

### dssclearConditions.json

**설명:** 날씨 조건 배열
`["맑음", "대체로맑음", "구름 많음", "대체로 흐림", "안개", "옅은안개", "물안개"]`

---

### dstask.json

| 키              | 설명                                                |
| --------------- | --------------------------------------------------- |
| `category`    | 작업 카테고리 (그린, 티, FW, S/K, 장비, 수목, 기타) |
| `Task`        | 작업 목록 배열                                      |
| `area`        | 해당 영역 배열                                      |
| `courseNames` | 코스 이름 배열                                      |
| `start_row`   | 시작 행 번호                                        |

**설명:** 카테고리별 작업 정의 (7개 카테고리)

---

### dstypeOrder.json

**설명:** 약품 타입 순서 배열
`["살균제", "제초제", "살충제", "비료", "기타"]`

---

### dswindConditions.json

**설명:** 바람 조건 배열
`["바람 없음", "바람", "강풍", "돌풍", "태풍"]`

---

## work 폴더

### org_info.json

| 키          | 설명                                    |
| ----------- | --------------------------------------- |
| `id`      | UUID                                    |
| `OrgCode` | 조직 코드 (H001, O001~O012, P001~P004) |
| `name`    | 조직명                                  |

**설명:** 조직 상세 정보 (17개 조직: 본사, 용역업체, 방제팀)

---

### outsource_info.json

| 키            | 설명              |
| ------------- | ----------------- |
| `dsids`     | 외주 ID           |
| `name`      | 외주 서비스명     |
| `unit`      | 단위 (FTE)        |
| `type`      | 타입 ([무형상품]) |
| `infoL1~L3` | 분류 정보         |
| `flgWork`   | 작업 플래그       |
| `flgOut`    | 외주 플래그       |
| `flgSell`   | 판매 플래그       |

**설명:** 외주 인력 정보 (외부인력제초 남/여)

---

### task_info.json

| 키            | 설명                                           |
| ------------- | ---------------------------------------------- |
| `dsids`     | 작업 ID (T10001~T10014)                        |
| `name`      | 작업명 (제초전면, 라지페취전면, 시약, 시비 등) |
| `unit`      | 단위 (회)                                      |
| `type`      | 타입 ([무형상품])                              |
| `infoL1~L3` | 분류 정보                                      |
| `flgWork`   | 작업 플래그                                    |
| `flgOut`    | 외주 플래그                                    |

**설명:** 방제 작업 유형 정의 (14개 작업 유형)

---

### vehicle_info.json

| 키            | 설명                                   |
| ------------- | -------------------------------------- |
| `dsids`     | 차량/장비 ID                           |
| `name`      | 장비명 (에어텍, 1톤차량, 쿠쉬맨, 드론) |
| `unit`      | 단위 (FTE, 대)                         |
| `type`      | 타입                                   |
| `infoL1~L3` | 분류 정보                              |
| `flgWork`   | 작업 플래그                            |
| `flgOut`    | 외주 플래그                            |
| `flgSell`   | 판매 플래그                            |

**설명:** 작업 차량/장비 정보 (4개 장비)

---

## 파일 요약 통계

| 폴더      | 파일명                         | 레코드 수  |
| --------- | ------------------------------ | ---------- |
| common    | dsOrgList.json                 | 11         |
| common    | dsworkcourse_info.json         | 99         |
| common    | mapcourse_info.json            | 44         |
| geo       | area_def.json                  | 12         |
| geo       | label_info.json                | 60         |
| geo       | label_infoL2.json              | 52         |
| geo       | turf_type.json                 | 5          |
| outrecord | dsEQCategoryTypeMAP.json       | 6 카테고리 |
| outrecord | dsEQtypeOrder.json             | 6          |
| outrecord | dsEQtypeSymMap.json            | 6          |
| outrecord | dsOrgList.json                 | 11         |
| outrecord | dsOrgOrder.json                | 11         |
| outrecord | dsholidays.json                | 39         |
| outrecord | dsprecipitationConditions.json | 11         |
| outrecord | dsrankOrder.json               | 9          |
| outrecord | dssclearConditions.json        | 7          |
| outrecord | dstask.json                    | 7 카테고리 |
| outrecord | dstypeOrder.json               | 5          |
| outrecord | dswindConditions.json          | 5          |
| work      | org_info.json                  | 17         |
| work      | outsource_info.json            | 2          |
| work      | task_info.json                 | 14         |
| work      | vehicle_info.json              | 4          |
