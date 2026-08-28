/**
 * 数据库初始化脚本
 *
 * 创建 document / chunk / query_log 表及索引后退出。
 * 若当前用户无建表权限，会打印清晰指引（执行 scripts/init-schema.sql）。
 */
import { initTables } from './models/index.js';
import { closePool } from './core/postgres.js';

async function main(): Promise<void> {
  console.log('开始创建数据库表...');
  try {
    await initTables();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/permission denied for schema public/i.test(message)) {
      console.error('\n建表失败：当前 POSTGRES_DSN 用户没有 public schema 的 CREATE 权限。');
      console.error('请按下面步骤操作：');
      console.error('1. 打开 pgAdmin，用 postgres（或 rag_db 的 owner）登录');
      console.error('2. 选中数据库 rag_db → 右键 Query Tool');
      console.error('3. 打开并执行文件：node-server/scripts/init-schema.sql');
      console.error('4. 执行成功后重启 pnpm dev\n');
      console.error(`原始错误: ${message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
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
