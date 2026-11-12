import * as migration_20261105_082805_initial from './20261105_082805_initial';
import * as migration_20261105_083701_search_and_jobs from './20261105_083701_search_and_jobs';
import * as migration_20261105_083945_mcp_api_keys from './20261105_083945_mcp_api_keys';
import * as migration_20261106_141957_ai_compose from './20261106_141957_ai_compose';
import * as migration_20261106_151749_mcp_blog_create from './20261106_151749_mcp_blog_create';
import * as migration_20261112_121716_consent from './20261112_121716_consent';
import * as migration_20261112_130229_consent_preferences from './20261112_130229_consent_preferences';

export const migrations = [
  {
    up: migration_20261105_082805_initial.up,
    down: migration_20261105_082805_initial.down,
    name: '20261105_082805_initial',
  },
  {
    up: migration_20261105_083701_search_and_jobs.up,
    down: migration_20261105_083701_search_and_jobs.down,
    name: '20261105_083701_search_and_jobs',
  },
  {
    up: migration_20261105_083945_mcp_api_keys.up,
    down: migration_20261105_083945_mcp_api_keys.down,
    name: '20261105_083945_mcp_api_keys',
  },
  {
    up: migration_20261106_141957_ai_compose.up,
    down: migration_20261106_141957_ai_compose.down,
    name: '20261106_141957_ai_compose',
  },
  {
    up: migration_20261106_151749_mcp_blog_create.up,
    down: migration_20261106_151749_mcp_blog_create.down,
    name: '20261106_151749_mcp_blog_create',
  },
  {
    up: migration_20261112_121716_consent.up,
    down: migration_20261112_121716_consent.down,
    name: '20261112_121716_consent',
  },
  {
    up: migration_20261112_130229_consent_preferences.up,
    down: migration_20261112_130229_consent_preferences.down,
    name: '20261112_130229_consent_preferences'
  },
];
