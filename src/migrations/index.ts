import * as migration_20260822_175035_initial_schema from './20260822_175035_initial_schema';

export const migrations = [
  {
    up: migration_20260822_175035_initial_schema.up,
    down: migration_20260822_175035_initial_schema.down,
    name: '20260822_175035_initial_schema'
  },
];
