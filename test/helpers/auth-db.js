const crypto = require('node:crypto');
const { User, SocialAccount, UserGrowth, UserSetting, UserSession } = require('@leren/database');

function database() {
  let tables = new Map([User, SocialAccount, UserGrowth, UserSetting, UserSession].map(entity => [entity, []]));
  let collide = false;
  let transactions = 0;
  const repository = entity => ({
    create: data => ({ ...data }),
    findOneBy: async where => tables.get(entity).find(row => Object.entries(where).every(([key, value]) => row[key] === value)) || null,
    findOne: async ({ where }) => tables.get(entity).find(row => Object.entries(where).every(([key, value]) => {
      if (key === 'revokedAt') return row.revokedAt == null;
      if (key === 'expiresAt') return row.expiresAt > new Date();
      return row[key] === value;
    })) || null,
    save: async row => {
      if (entity === SocialAccount && collide) {
        collide = false;
        const error = new Error('duplicate identity');
        error.code = '23505';
        error.constraint = 'social_accounts_provider_provider_user_id_idx';
        throw error;
      }
      if (entity === User && !row.userId) row.userId = crypto.randomUUID();
      if (!tables.get(entity).includes(row)) tables.get(entity).push(row);
      return row;
    },
    update: async (where, data) => {
      for (const row of tables.get(entity)) {
        if (Object.entries(where).every(([key, value]) => key === 'revokedAt'
          ? row.revokedAt == null : row[key] === value)) Object.assign(row, data);
      }
    },
  });
  return {
    rows: entity => tables.get(entity),
    collide: () => { collide = true; },
    transactionCount: () => transactions,
    getRepository: repository,
    transaction: async callback => {
      transactions++;
      const before = new Map([...tables].map(([key, rows]) => [key, structuredClone(rows)]));
      try { return await callback({ getRepository: repository }); } catch (error) {
        tables = before;
        if (error.code === '23505') {
          const user = { userId: crypto.randomUUID(), nickname: 'winner', email: null, accountStatus: 'ACTIVE' };
          tables.get(User).push(user);
          tables.get(SocialAccount).push({ provider: 'KAKAO', providerUserId: '123', userId: user.userId });
        }
        throw error;
      }
    },
  };
}

module.exports = database;
