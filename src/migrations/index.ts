import * as migration_20260823_043347_initial_schema from './20260823_043347_initial_schema';
import * as migration_20260823_073621_guest_notes from './20260823_073621_guest_notes';

export const migrations = [
  {
    up: migration_20260823_043347_initial_schema.up,
    down: migration_20260823_043347_initial_schema.down,
    name: '20260823_043347_initial_schema',
  },
  {
    up: migration_20260823_073621_guest_notes.up,
    down: migration_20260823_073621_guest_notes.down,
    name: '20260823_073621_guest_notes'
  },
];
