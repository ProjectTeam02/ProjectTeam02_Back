# 공용 한벌옷 코스튬 API

WARRIOR·MAGE·ARCHER는 같은 판매 상품을 조회하고 각각 `itemId` 하나로 구매하고 장착합니다. 현재 직업은 목록, 가격, 소유, 장착에 관여하지 않습니다. 코스튬은 외형에만 사용합니다.

## API 계약

모든 요청에 Leren Bearer 액세스 토큰을 보냅니다. 성공 응답은 `{ "success": true, "data": ... }` 형식입니다.

| Method와 경로 | 상태 | `data` |
| --- | --- | --- |
| `GET /api/v1/shop/costumes?page=1&size=20` | 200 | `items`, `page`, `size`, `total` |
| `GET /api/v1/shop/costumes/{itemId}` | 200 | 판매 중인 상품 하나와 사용자별 `owned`, `equipped` |
| `POST /api/v1/shop/purchases` | 201 | `purchaseId`, `itemId`, `coinBalance`, 같은 구매 재전송 시 `duplicate: true` |
| `GET /api/v1/inventory` | 200 | 전체 보유 상품 `items`, 현재 장착 `equipped` 배열 0~1개 |
| `PUT /api/v1/inventory/{itemId}/equip` | 200 | 현재 장착한 상품의 `category`, `itemId` |
| `GET /api/v1/users/me` | 200 | 프로필과 `equippedCostumes` 배열 0~1개 |

`category`는 기존 데이터 분류인 `TOP` 또는 `BOTTOM`입니다. 새 UI는 상품을 구분하거나 장착 상태를 계산하는 데 이 필드를 사용하지 않습니다. 기존 목록 쿼리의 `category=TOP`·`BOTTOM`은 호환용이므로 공용 목록 요청에서는 생략합니다. `WARRIOR`·`MAGE`·`ARCHER`를 `category`로 보내면 422입니다. `size` 기본값은 20이고 최댓값은 100입니다. `limit`도 호환용으로 지원합니다.

`priceCoin`과 `coinBalance`는 기존 Gold 정수 필드입니다. 상품명은 `name`, 이미지 참조는 `imageKey`·`thumbnailKey`입니다. 재화 부족 또는 다른 `requestId`로 이미 보유한 상품을 다시 구매하면 409입니다. 판매 중이 아닌 상품의 상점 상세 조회와 구매는 404입니다. 미보유 상품 장착은 403입니다. 장착 해제 전용 API는 없으며 다른 상품을 장착하면 이전 상품이 자동 해제됩니다.

### 목록 및 상세

`GET /api/v1/shop/costumes?page=1&size=20`

```json
{
  "success": true,
  "data": {
    "items": [{
      "itemId": "9942012e-eb31-4adb-8d4a-e67946d34fc1",
      "costumeCode": "BLUE_DAWN_ROBE",
      "name": "푸른 새벽 로브",
      "description": null,
      "flavorText": null,
      "category": "TOP",
      "priceCoin": 300,
      "imageKey": null,
      "thumbnailKey": null,
      "isOnSale": true,
      "owned": false,
      "equipped": false
    }],
    "page": 1,
    "size": 20,
    "total": 1
  }
}
```

상점 상세의 `data`는 목록의 `items`에 들어 있는 상품과 같은 타입입니다.

### 구매

`POST /api/v1/shop/purchases`

```json
{"itemId":"9942012e-eb31-4adb-8d4a-e67946d34fc1","requestId":"costume:ea85ff7f-4ebe-4d15-9a2b-7c214a7ac804"}
```

500 Gold에서 300 Gold 상품을 구매한 예입니다. 네트워크 실패로 동일 구매를 재시도할 때 같은 `requestId`를 보냅니다.

```json
{"success":true,"data":{"purchaseId":"3ac96665-b446-4ef5-9c0e-fcaae0d9641f","itemId":"9942012e-eb31-4adb-8d4a-e67946d34fc1","coinBalance":200}}
```

### 보관함 및 장착

`GET /api/v1/inventory`에서 구매가 끝나고 아직 장착하지 않은 경우입니다.

```json
{
  "success": true,
  "data": {
    "items": [{
      "itemId": "9942012e-eb31-4adb-8d4a-e67946d34fc1",
      "costumeCode": "BLUE_DAWN_ROBE",
      "name": "푸른 새벽 로브",
      "description": null,
      "flavorText": null,
      "category": "TOP",
      "priceCoin": 300,
      "imageKey": null,
      "thumbnailKey": null,
      "isOnSale": true,
      "owned": true,
      "equipped": false
    }],
    "equipped": []
  }
}
```

`PUT /api/v1/inventory/9942012e-eb31-4adb-8d4a-e67946d34fc1/equip`는 본문 없이 호출합니다.

```json
{"success":true,"data":{"category":"TOP","itemId":"9942012e-eb31-4adb-8d4a-e67946d34fc1"}}
```

재조회하면 해당 상품의 `equipped`는 `true`이고, `data.equipped`에는 응답과 같은 `{category, itemId}` 객체 하나가 들어갑니다. 기존에 두 부위가 장착돼 있으면 서버는 `equipped_at`이 가장 최근인 상품을 표시합니다. 시각이 같으면 `itemId` 오름차순으로 결정합니다. 기존 장착 행은 사용자가 장착에 성공할 때까지 보존합니다. 장착 트랜잭션은 사용자 행을 잠그고 다른 부위의 장착만 정리합니다. 상품, 소유, 잔액, 원장은 그대로 유지됩니다.

### 직업 선택 및 변경

최초 선택은 `PATCH /api/v1/users/me/character-class`, 변경은 `PATCH /api/v1/users/me/character/class`입니다. 두 경로 모두 `{"classCode":"MAGE"}` 형식의 본문을 받습니다. 직업 변경의 성공 `data`는 `userId`, `classId`, `classCode`입니다. 변경 후 보유 상품, 한벌옷 장착, 잔액 및 거래 원장은 유지됩니다.

## 프론트 담당자 확인

`feat/add-features`의 `frontend/src/screens/mypage/CostumeShopScreen.tsx`에서 직업 탭, `filteredItems`의 분류 비교, `분류` 표시를 제거합니다. 서버의 `items`와 페이지 수를 사용합니다. `frontend/src/screens/mypage/WardrobeScreen.tsx`는 `itemId` 또는 상품의 `equipped`를 기준으로 표시하고, 장착 후 보관함과 프로필을 다시 조회합니다. `frontend/src/services/costumeApi.ts`의 현재 디코더는 호환됩니다. `frontend/src/services/apiConfig.ts`의 `EXPO_PUBLIC_API_URL`을 확인할 개발 서버로 지정합니다.

1. 세 직업 계정에서 같은 상점 상품 ID와 가격을 확인합니다.
2. 구매한 직후 잔액과 보유 표시를 확인하고, 장착 전에도 보관함에 표시되는지 확인합니다.
3. 두 상품을 순서대로 장착해 마지막 상품만 장착 중인지 확인합니다. 같은 상품을 다시 장착하거나 앱을 다시 열어도 한 개만 표시되는지 확인합니다.
4. 직업을 바꾼 뒤 같은 보관함과 장착 상품, 잔액이 보이는지 확인합니다.
5. 승인된 한벌옷 이미지를 확인합니다. `frontend/src/constants/costumeImages.ts`의 이름 기반 매핑과 상품 이미지 키의 관계도 프론트에서 확인합니다.

새 Migration이나 기존 상품 일괄 변환은 필요하지 않습니다. 사용자당 한벌옷 하나는 현 API의 트랜잭션에서 보장합니다. 이전 서버는 부위별 장착을 저장할 수 있으므로 배포 후 장착 요청을 받는 서버의 버전이 모두 일치하는지 확인합니다. 기존 부위 전용 이미지가 실제 판매 SKU에 연결돼 있다면 배포 전 승인된 한벌옷 이미지와 연결합니다.
