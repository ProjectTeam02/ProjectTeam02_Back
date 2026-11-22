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

목록·상세·보관함·장착·프로필의 코스튬 `category` 값은 `OUTFIT`입니다. 공용 목록 요청에서는 `category`를 생략합니다. 기존 요청과의 호환을 위해 `category=TOP`, `category=BOTTOM`, `category=OUTFIT`은 모두 같은 목록을 반환합니다. `WARRIOR`·`MAGE`·`ARCHER`를 `category`로 보내면 422입니다. `size` 기본값은 20이고 최댓값은 100입니다. `limit`도 호환용으로 지원합니다.

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
      "category": "OUTFIT",
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
      "category": "OUTFIT",
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
{"success":true,"data":{"category":"OUTFIT","itemId":"9942012e-eb31-4adb-8d4a-e67946d34fc1"}}
```

재조회하면 해당 상품의 `equipped`는 `true`이고, `data.equipped`에는 응답과 같은 `{category, itemId}` 객체 하나가 들어갑니다. 장착 요청은 사용자 행을 잠그고 장착 행을 교체합니다. DB는 `OUTFIT`만 허용하는 Enum과 `(user_id, category)` 기본 키로 사용자당 한 건을 보장합니다. 상품 ID, 소유, 잔액, 원장은 그대로 유지됩니다.

### 직업 선택 및 변경

최초 선택은 `PATCH /api/v1/users/me/character-class`, 변경은 `PATCH /api/v1/users/me/character/class`입니다. 두 경로 모두 `{"classCode":"MAGE"}` 형식의 본문을 받습니다. 직업 변경의 성공 `data`는 `userId`, `classId`, `classCode`입니다. 변경 후 보유 상품, 한벌옷 장착, 잔액 및 거래 원장은 유지됩니다.

### 직업 기본 한벌옷

직업마다 기본 한벌옷이 하나씩 있습니다(`WARRIOR_DEFAULT_OUTFIT`, `MAGE_DEFAULT_OUTFIT`, `ARCHER_DEFAULT_OUTFIT`). 기본 한벌옷은 판매하지 않으므로 상점 목록과 상세(404)에 나오지 않습니다.

- 최초 직업 선택: 선택한 직업의 기본 한벌옷을 보관함에 지급(`acquireType` DEFAULT)하고 바로 장착합니다. 응답 형식은 바뀌지 않으며, 보관함(`GET /inventory`)과 프로필(`GET /users/me`의 `equippedCostumes`)에서 확인합니다.
- 직업 변경: 바꾼 직업의 기본 한벌옷을 보관함에 추가합니다. 장착 중인 옷은 바꾸지 않습니다.
- 이미 보유한 옷은 다시 지급하지 않고, 이미 장착한 옷이 있으면 그대로 둡니다.
- 이미지 키(`imageKey`, `thumbnailKey`)는 아직 `null`입니다. 확정되면 `database/sql/seed/01_master_data.sql`에서 채웁니다.

### 판매 상품 (임시)

판매 상품은 `database/sql/seed/02_shop_costumes.sql`로 등록합니다. 지금 값은 확정 전 임시값이며, 확정되면 파일의 `VALUES`만 고쳐 다시 실행합니다(같은 `costumeCode`는 값만 갱신).

| `costumeCode` | `name` | `priceCoin` | `imageKey` / `thumbnailKey` |
| --- | --- | --- | --- |
| `BLUE_DAWN_ROBE` | 푸른 새벽 로브 | 50 | `costumes/blue_dawn_robe.png` |
| `STARLIGHT_ROBE` | 별빛 로브 | 100 | `costumes/starlight_robe.png` |
| `GOLDEN_GUARDIAN` | 황금 수호자 | 150 | `costumes/golden_guardian.png` |

- 이미지 키는 앱에 포함된 이미지 파일 경로(`frontend/assets/<imageKey>`)와 같은 값입니다. 프론트는 지금 `costumeCode` 또는 `name`으로 번들 이미지를 찾으므로 세 상품은 바로 표시됩니다. 나중에 S3·CloudFront로 옮기면 같은 키를 객체 경로로 씁니다.
- 판매 중지는 그 상품의 `is_on_sale`만 `false`로 바꿔 다시 실행합니다. 구매 원장과 보유 기록이 상품 ID를 참조하므로 행을 지우거나 코드를 바꾸지 않습니다.
- 직업 기본 한벌옷은 판매할 수 없습니다(시드 검증에서 오류).

## 프론트 담당자 확인

`feat/add-features`의 `frontend/src/screens/mypage/CostumeShopScreen.tsx`에서 직업 탭, `filteredItems`의 분류 비교, `분류` 표시를 제거합니다. 서버의 `items`와 페이지 수를 사용합니다. `frontend/src/screens/mypage/WardrobeScreen.tsx`는 `itemId` 또는 상품의 `equipped`를 기준으로 표시하고, 장착 후 보관함과 프로필을 다시 조회합니다. `frontend/src/services/costumeApi.ts`의 현재 디코더는 호환됩니다. `frontend/src/services/apiConfig.ts`의 `EXPO_PUBLIC_API_URL`을 확인할 개발 서버로 지정합니다.

1. 세 직업 계정에서 같은 상점 상품 ID와 가격을 확인합니다.
2. 구매한 직후 잔액과 보유 표시를 확인하고, 장착 전에도 보관함에 표시되는지 확인합니다.
3. 두 상품을 순서대로 장착해 마지막 상품만 장착 중인지 확인합니다. 같은 상품을 다시 장착하거나 앱을 다시 열어도 한 개만 표시되는지 확인합니다.
4. 직업을 바꾼 뒤 같은 장착 상품과 잔액이 보이고, 보관함에 바꾼 직업의 기본 한벌옷이 추가됐는지 확인합니다.
5. 승인된 한벌옷 이미지를 확인합니다. `frontend/src/constants/costumeImages.ts`의 이름 기반 매핑과 상품 이미지 키의 관계도 프론트에서 확인합니다.
6. 새 계정으로 직업을 고른 직후 그 직업의 기본 한벌옷이 장착되어 있는지 확인합니다.

## 기존 DB 전환

`1795080000000-SharedCostumeOutfit`은 트랜잭션에서 상품과 장착을 `OUTFIT`으로 바꿉니다. 상품 ID, SKU, 가격, 소유·구매행, 잔액·원장은 유지합니다. 장착 두 건이 있으면 #139와 같은 `equipped_at DESC, item_id ASC` 기준으로 한 건을 유지합니다. 다른 한 건은 원래 분류와 시각을 그대로 `character.legacy_equipped_costumes`에 보관합니다. 보관 테이블은 장착 조회 및 쓰기에 사용하지 않습니다.

배포 시 장착·구매 쓰기를 중지하고 스냅샷을 만든 뒤 Migration과 새 백엔드 배포를 같은 점검 구간에서 진행합니다. 배포 스크립트가 기존 서버를 유지한 채 Migration을 실행하는 환경에서는 트래픽을 먼저 중지합니다. 재개 전 전체 목록·구매·장착을 확인합니다. 기존 상품 분류를 `OUTFIT`에서 역산할 수 없으므로 자동 다운 Migration은 중단됩니다. 쓰기 재개 전 되돌려야 하면 사전 스냅샷과 이전 백엔드 버전을 함께 복구합니다.
