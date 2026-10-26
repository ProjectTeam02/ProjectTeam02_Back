const { User, UserGrowth } = require('@leren/database');

function repository(dataSource) {
  return {
    async findWithGrowth(id, manager = dataSource.manager) {
      const user = await manager.getRepository(User).findOneBy({ userId: id });
      if (!user) return null;
      const growth = await manager.getRepository(UserGrowth).findOneBy({ userId: id });
      return { user, growth };
    },
  };
}

module.exports = repository;
