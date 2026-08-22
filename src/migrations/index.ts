import * as migration_20260822_195132_initial_schema from './20260822_195132_initial_schema';
import * as migration_20260822_205826_add_seo_keywords from './20260822_205826_add_seo_keywords';

export const migrations = [
  {
    up: migration_20260822_195132_initial_schema.up,
    down: migration_20260822_195132_initial_schema.down,
    name: '20260822_195132_initial_schema',
  },
  {
    up: migration_20260822_205826_add_seo_keywords.up,
    down: migration_20260822_205826_add_seo_keywords.down,
    name: '20260822_205826_add_seo_keywords'
  },
];
