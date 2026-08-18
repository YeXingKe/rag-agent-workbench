/**
 * 数据库初始化脚本
 *
 * 创建 document / chunk / query_log 表及索引后退出；
 * 生产环境更推荐使用正式迁移工具。
 */
import { initTables } from './models/index.js';
import { closePool } from './core/postgres.js';

async function main(): Promise<void> {
  console.log('开始创建数据库表...');
  await initTables();
  console.log('数据库表创建完成！');
  console.log('\n已创建的表：');
  for (const table of ['document', 'chunk', 'query_log']) {
    console.log(`  - ${table}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
