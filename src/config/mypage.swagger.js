/** Figma 19-01: basic My Page. The other 19-series screens use separate APIs. */
const nullableInteger = { type: 'integer', nullable: true };
const nullableString = { type: 'string', nullable: true };

module.exports = {
  schemas: {
    MyPage: {
      type: 'object',
      required: ['userId', 'nickname', 'level', 'totalExp', 'economyLevel', 'economyExp',
        'characterClass', 'equippedCostumes', 'coinBalance', 'completedStageCount'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        nickname: { type: 'string' },
        email: nullableString,
        plan: { type: 'string' },
        level: nullableInteger,
        totalExp: nullableInteger,
        economyLevel: nullableInteger,
        economyExp: nullableInteger,
        characterClass: {
          type: 'object', nullable: true,
          properties: {
            classId: { type: 'string', format: 'uuid' },
            classCode: { type: 'string' },
            name: { type: 'string' },
            imageKey: nullableString,
          },
        },
        equippedCostumes: {
          type: 'array', items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['TOP', 'BOTTOM'] },
              itemId: { type: 'string', format: 'uuid' },
              name: nullableString,
              imageKey: nullableString,
            },
          },
        },
        coinBalance: nullableInteger,
        completedStageCount: { type: 'integer', minimum: 0 },
      },
    },
  },
};
