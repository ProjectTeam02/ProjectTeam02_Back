/**
 * 달력 기능별 API 라우터 파일
 * 백엔드 작업: 엔드포인트와 Controller를 연결
 * 주의: 기존 API 경로와 HTTP Method 변경 금지
<<<<<<< HEAD
 * 현재 상태: 구현 전 스캐폴드이며 역할별 코드를 이 파일에 작성합니다.
 */
const express = require('express');

const router = express.Router();

=======
 */
const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const schema = require('./calendar.schema');
const service = require('./calendar.service')();
const controller = require('./calendar.controller')(service);

const router = express.Router();
router.use(auth);
router.get('/', validate(schema.month), controller.month);
router.get('/days/:date', validate(schema.day), controller.day);
router.post('/plans', validate(schema.create), controller.create);
router.patch('/plans/:planId', validate(schema.update), controller.update);
router.delete('/plans/:planId', validate(schema.remove), controller.remove);
>>>>>>> f41d35265091600e7b8b1205fe98dd7b019510a3
module.exports = router;
