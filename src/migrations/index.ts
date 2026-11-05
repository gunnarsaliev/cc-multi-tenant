import * as migration_20261105_082805_initial from './20261105_082805_initial';
import * as migration_20261105_083701_search_and_jobs from './20261105_083701_search_and_jobs';

export const migrations = [
  {
    up: migration_20261105_082805_initial.up,
    down: migration_20261105_082805_initial.down,
    name: '20261105_082805_initial',
  },
  {
    up: migration_20261105_083701_search_and_jobs.up,
    down: migration_20261105_083701_search_and_jobs.down,
    name: '20261105_083701_search_and_jobs'
  },
];
