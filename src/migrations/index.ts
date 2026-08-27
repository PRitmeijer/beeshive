import * as migration_20260823_043347_initial_schema from './20260823_043347_initial_schema';
import * as migration_20260823_073621_guest_notes from './20260823_073621_guest_notes';
import * as migration_20260823_081514_drop_companion_note from './20260823_081514_drop_companion_note';
import * as migration_20260823_162424_guest_response_note from './20260823_162424_guest_response_note';
import * as migration_20260823_204347_welcome_texts from './20260823_204347_welcome_texts';
import * as migration_20260823_211514_order_autofill from './20260823_211514_order_autofill';
import * as migration_20260823_213000_order_renumber from './20260823_213000_order_renumber';
import * as migration_20260824_183327_confirmation_mail from './20260824_183327_confirmation_mail';
import * as migration_20260824_192054_confirmation_mode from './20260824_192054_confirmation_mode';
import * as migration_20260824_213000_slot_minutes from './20260824_213000_slot_minutes';
import * as migration_20260824_214000_drop_occasion from './20260824_214000_drop_occasion';
import * as migration_20260825_130353_last_sitting_minutes from './20260825_130353_last_sitting_minutes';
import * as migration_20260827_122947_payload_388_sessions from './20260827_122947_payload_388_sessions';

export const migrations = [
  {
    up: migration_20260823_043347_initial_schema.up,
    down: migration_20260823_043347_initial_schema.down,
    name: '20260823_043347_initial_schema',
  },
  {
    up: migration_20260823_073621_guest_notes.up,
    down: migration_20260823_073621_guest_notes.down,
    name: '20260823_073621_guest_notes',
  },
  {
    up: migration_20260823_081514_drop_companion_note.up,
    down: migration_20260823_081514_drop_companion_note.down,
    name: '20260823_081514_drop_companion_note',
  },
  {
    up: migration_20260823_162424_guest_response_note.up,
    down: migration_20260823_162424_guest_response_note.down,
    name: '20260823_162424_guest_response_note',
  },
  {
    up: migration_20260823_204347_welcome_texts.up,
    down: migration_20260823_204347_welcome_texts.down,
    name: '20260823_204347_welcome_texts',
  },
  {
    up: migration_20260823_211514_order_autofill.up,
    down: migration_20260823_211514_order_autofill.down,
    name: '20260823_211514_order_autofill',
  },
  {
    up: migration_20260823_213000_order_renumber.up,
    down: migration_20260823_213000_order_renumber.down,
    name: '20260823_213000_order_renumber',
  },
  {
    up: migration_20260824_183327_confirmation_mail.up,
    down: migration_20260824_183327_confirmation_mail.down,
    name: '20260824_183327_confirmation_mail',
  },
  {
    up: migration_20260824_192054_confirmation_mode.up,
    down: migration_20260824_192054_confirmation_mode.down,
    name: '20260824_192054_confirmation_mode',
  },
  {
    up: migration_20260824_213000_slot_minutes.up,
    down: migration_20260824_213000_slot_minutes.down,
    name: '20260824_213000_slot_minutes',
  },
  {
    up: migration_20260824_214000_drop_occasion.up,
    down: migration_20260824_214000_drop_occasion.down,
    name: '20260824_214000_drop_occasion',
  },
  {
    up: migration_20260825_130353_last_sitting_minutes.up,
    down: migration_20260825_130353_last_sitting_minutes.down,
    name: '20260825_130353_last_sitting_minutes',
  },
  {
    up: migration_20260827_122947_payload_388_sessions.up,
    down: migration_20260827_122947_payload_388_sessions.down,
    name: '20260827_122947_payload_388_sessions'
  },
];
