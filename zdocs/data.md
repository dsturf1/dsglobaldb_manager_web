| Key            | 설명                                                                                                      | 예시 값   |
| -------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| `name`       | 제품 이름                                                                                                 | 애니탄    |
| `unit`       | 제품 단위<br />                                                                                           | 300g      |
| `type`       | 제품 유형                                                                                                 | 제품      |
| `infoL1`     | 1차 분류 (중분류)<br />살균제(A1), <br />살충제(A2),<br /> 제초제(A3), <br />비료(B0), <br />기타약재(C0) | 살균제    |
| `infoL2`     | 2차 분류 (대분류), <br />농약(A), <br />비료(B), <br />기타약재(C)                                        | 농약      |
| `infoL3`     | 3차 분류 (중요도) 중요도 1,2,3,4,5<br /><br />중요도 정리 아래 참조                                       | 중요도2   |
| `flgWork`    | 방제팀 에서 사용 (Y: 가능)                                                                               | Y         |
| `active`     | 전체 사용여부 (Y: 활성화)                                                                                 | Y         |
| `flgOut`     | 용역팀 사용 여부                                                                                          | Y         |
| `dsids`      | 제품 고유 식별자 아이디                                                                                   | A15261    |
| `cost`       | 원가 (물품을 상대로 변경가능한값)                                                                         | 36,279.78 |
| `IN_PRICE`   | 구매 가격                                                                                                 | 0         |
| `OUT_PRICE`  | 출고 가격 (용역팀)                                                                                        | 0         |
| `OUT_PRICE1` | 출고 가격 (외부))                                                                                         | 0         |

최종 2년간 물품당 구매금액 총합

|         | 2023+2024   |
| :------ | ----------- |
| 중요도1 | 100,000,000 |
| 중요도2 | 50,000,000  |
| 중요도3 | 10,000,000  |
| 중요도4 | 1,000,000   |
| 중요도5 |             |
