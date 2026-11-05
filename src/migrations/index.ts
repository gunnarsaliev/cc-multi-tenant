import * as migration_20261105_082805_initial from './20261105_082805_initial';

export const migrations = [
  {
    up: migration_20261105_082805_initial.up,
    down: migration_20261105_082805_initial.down,
    name: '20261105_082805_initial'
  },
];
