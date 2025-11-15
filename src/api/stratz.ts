/**
 * Stratz API клиент (GraphQL)
 * 
 * Документация: https://stratz.com/api
 * GraphQL Endpoint: https://api.stratz.com/graphql
 * 
 * Для получения токена: https://stratz.com/api
 */

import type { HeroRole } from '../types';

const STRATZ_API_BASE = 'https://api.stratz.com/graphql';

/**
 * Маппинг roleId из Stratz API в HeroRole
 * Stratz API возвращает строковые roleId: CARRY, NUKER, INITIATOR, DURABLE, 
 * ESCAPE, DISABLER, SUPPORT, PUSHER, JUNGLER
 * 
 * Логика определения позиций:
 * - CARRY → может быть Pos 1 (carry), иногда Pos 2 (mid)
 * - SUPPORT → может быть Pos 4 (soft-support) или Pos 5 (hard-support), иногда другие позиции
 * - INITIATOR → обычно Pos 3 (offlane), иногда другие позиции
 * - NUKER/PUSHER → обычно Pos 2 (mid), иногда другие позиции
 * - DURABLE → обычно Pos 3 (offlane), иногда другие позиции
 */
const mapRoleIdToHeroRole = (roleIds: string[]): HeroRole[] => {
  const result: HeroRole[] = [];
  const hasRole = (role: string) => roleIds.includes(role.toUpperCase());
  
  // Pos 1 (Carry) - если есть CARRY
  if (hasRole('CARRY')) {
    result.push('carry');
  }
  
  // Pos 2 (Mid) - проверяем несколько условий
  const canBeMid = 
    // NUKER или PUSHER без явной блокировки
    (hasRole('NUKER') || hasRole('PUSHER')) ||
    // CARRY + NUKER/PUSHER (герои типа Shadow Fiend, Morphling)
    (hasRole('CARRY') && (hasRole('NUKER') || hasRole('PUSHER')));
  
  if (canBeMid && !result.includes('mid')) {
    result.push('mid');
  }
  
  // Pos 3 (Offlane) - проверяем несколько условий
  const canBeOfflane = 
    // INITIATOR (обычно оффлейн)
    hasRole('INITIATOR') ||
    // DURABLE без CARRY
    (hasRole('DURABLE') && !hasRole('CARRY')) ||
    // INITIATOR + DURABLE
    (hasRole('INITIATOR') && hasRole('DURABLE'));
  
  if (canBeOfflane && !result.includes('offlane')) {
    result.push('offlane');
  }
  
  // Pos 4/5 (Support) - если есть SUPPORT
  if (hasRole('SUPPORT')) {
    // Большинство саппортов могут играть и на Pos 4, и на Pos 5
    // По умолчанию все саппорты могут быть на Pos 5
    
    // Всегда добавляем Pos 5 (Hard Support)
    if (!result.includes('hard-support')) {
      result.push('hard-support');
    }
    
    // Pos 4 (Soft Support) - добавляем если есть агрессивные роли:
    // DISABLER, NUKER, INITIATOR, PUSHER указывают на более активную игру (Pos 4)
    const hasAggressiveRoles = 
      hasRole('DISABLER') || 
      hasRole('NUKER') || 
      hasRole('INITIATOR') ||
      hasRole('PUSHER');
    
    // Если есть агрессивные роли - добавляем и Pos 4
    // Большинство саппортов с такими ролями могут играть на обеих позициях
    if (hasAggressiveRoles) {
      if (!result.includes('soft-support')) {
        result.push('soft-support');
      }
    }
    
    // Если SUPPORT + другие роли, не блокируем другие позиции
    // Например, Vengeful Spirit может быть carry и support одновременно
  }
  
  // Дополнительные проверки для комбинаций:
  
  // Если есть CARRY + INITIATOR - может быть и оффлейн (редко, но возможно)
  if (hasRole('CARRY') && hasRole('INITIATOR') && !result.includes('offlane')) {
    result.push('offlane');
  }
  
  // Если есть INITIATOR + PUSHER без CARRY - может быть и мид
  if (hasRole('INITIATOR') && hasRole('PUSHER') && !hasRole('CARRY') && !result.includes('mid')) {
    result.push('mid');
  }
  
  // Если есть только DURABLE и больше ничего значимого - оффлейн
  if (hasRole('DURABLE') && 
      !hasRole('CARRY') && 
      !hasRole('SUPPORT') && 
      !hasRole('INITIATOR') &&
      !hasRole('NUKER') && 
      !hasRole('PUSHER') &&
      !result.includes('offlane')) {
    result.push('offlane');
  }
  
  // Fallback: если ничего не подошло, пытаемся определить по доступным ролям
  if (result.length === 0) {
    if (hasRole('CARRY')) {
      result.push('carry');
    } else if (hasRole('SUPPORT')) {
      result.push('hard-support');
    } else if (hasRole('NUKER') || hasRole('PUSHER')) {
      result.push('mid');
    } else if (hasRole('INITIATOR') || hasRole('DURABLE')) {
      result.push('offlane');
    }
  }
  
  // Убираем дубликаты (на всякий случай)
  return [...new Set(result)];
};

/**
 * Получение ролей героя из данных Stratz API
 * 
 * @param hero - Объект героя из Stratz API
 * @returns Массив ролей героя
 */
export const getHeroRolesFromStratz = (hero: StratzHero): HeroRole[] => {
  if (!hero.roles || hero.roles.length === 0) {
    return [];
  }
  
  const roleIds = hero.roles.map(r => r.roleId.toUpperCase());
  return mapRoleIdToHeroRole(roleIds);
};

// Кеш для heroes в localStorage
const HEROES_CACHE_KEY = 'stratz_heroes_cache';
const HEROES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа

interface CachedHeroes {
  data: Array<{
    id: number;
    displayName: string;
    shortName: string;
    roles?: Array<{ roleId: string }>;
  }>;
  timestamp: number;
}

// Интерфейс для ответа Stratz API
export interface StratzHero {
  id: number;
  displayName: string;
  shortName: string;
  roles?: Array<{ roleId: string }>;
}

/**
 * Получение списка героев через Stratz GraphQL API
 * 
 * @returns Массив героев или null при ошибке
 */
export const fetchHeroes = async (): Promise<StratzHero[] | null> => {
  // Проверяем кеш в localStorage
  try {
    const cached = localStorage.getItem(HEROES_CACHE_KEY);
    if (cached) {
      const parsed: CachedHeroes = JSON.parse(cached);
      const now = Date.now();
      
      // Если кеш свежий (меньше 24 часов), используем его
      if (now - parsed.timestamp < HEROES_CACHE_TTL && Array.isArray(parsed.data)) {
        return parsed.data;
      }
    }
  } catch (error) {
    console.warn('Error reading heroes cache from localStorage:', error);
  }
  
  try {
    // GraphQL запрос для получения героев
    const query = `
      query GetHero {
        constants {
          heroes {
            id
            displayName
            shortName
            roles {
              roleId
            }
          }
        }
      }
    `;

    // Токен из переменной окружения или localStorage
    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch heroes: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions. Make sure VITE_STRATZ_API_KEY is set correctly.');
      }
      
      return null;
    }
    
    // Проверяем ошибки GraphQL
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    if (result.data?.constants?.heroes) {
      const heroes = result.data.constants.heroes;
      
      // Сохраняем в кеш
      try {
        const cache: CachedHeroes = {
          data: heroes,
          timestamp: Date.now(),
        };
        localStorage.setItem(HEROES_CACHE_KEY, JSON.stringify(cache));
      } catch (error) {
        console.warn('Error saving heroes cache to localStorage:', error);
      }
      
      return heroes;
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching heroes from Stratz API:', error);
    return null;
  }
};

// Интерфейс для статистики героя
export interface HeroStats {
  id: number;
  displayName: string;
  winRate: number;
  pickRate: number;
  banRate: number;
  matchCount?: number;
  winCount?: number;
  rank?: number;
}

// Интерфейс для статистики побед героя за месяц
export interface HeroWinStats {
  heroId: number;
  winCount: number;
  matchCount: number;
}

// Интерфейс для ответа HeroStats запроса
export interface HeroStatsResponse {
  heroStats: {
    winMonth: HeroWinStats[];
  };
}

// Кеш для статистики побед в localStorage
const HERO_WIN_STATS_CACHE_KEY = 'stratz_hero_win_stats_cache';
const HERO_WIN_STATS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 часов (обновляем чаще для актуальности)
const HERO_WIN_STATS_DATA_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 дней - максимальный возраст данных

interface CachedHeroWinStats {
  data: HeroWinStats[];
  timestamp: number; // Время получения данных с сервера
  dataTimestamp: number; // Время, когда данные были актуальны (для фильтрации по месяцу)
}

/**
 * Получение статистики героя (winRate, pickRate, banRate) через Stratz GraphQL API
 * 
 * @param heroId - ID героя (число от 1 до ~126)
 * @returns Статистика героя или null при ошибке
 */
export const fetchHeroStats = async (heroId: number): Promise<HeroStats | null> => {
  try {
    // Основной запрос: hero -> stats
    const query = `
      query GetHeroStats($heroId: Short!) {
        hero(heroId: $heroId) {
          id
          displayName
          stats {
            winRate
            pickRate
            banRate
            matchCount
            winCount
            rank
          }
        }
      }
    `;

    // Токен из переменной окружения или localStorage
    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    // Выполняем основной запрос
    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { heroId },
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch hero stats: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions.');
      }
      
      return null;
    }
    
    // Если основной запрос успешен и содержит ожидаемые данные
    if (!result.errors && result.data?.hero?.stats) {
      return {
        id: result.data.hero.id,
        displayName: result.data.hero.displayName,
        ...result.data.hero.stats,
      };
    }

    // Если поле stats отсутствует или GraphQL вернул ошибку — пробуем фоллбек через heroStat.hero
    const fallbackQuery = `
      query GetHeroStatsFallback($heroId: Short!) {
        heroStat {
          hero(heroId: $heroId) {
            id
            displayName
            winRate
            pickRate
            banRate
            matchCount
            winCount
            rank
          }
        }
      }
    `;

    const fallbackResponse = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: fallbackQuery,
        variables: { heroId },
      }),
    });

    let fallbackResult;
    try {
      fallbackResult = await fallbackResponse.json();
    } catch {
      const errorText = await fallbackResponse.text().catch(() => 'Unknown error');
      console.error(`Failed to parse fallback response: ${errorText}`);
      return null;
    }

    if (!fallbackResponse.ok) {
      console.error(`Failed to fetch hero stats (fallback): ${fallbackResponse.status} ${fallbackResponse.statusText}`, fallbackResult);
      return null;
    }

    if (fallbackResult.errors) {
      console.error('GraphQL errors from Stratz API (fallback):', fallbackResult.errors);
      return null;
    }

    const fallbackHero = fallbackResult.data?.heroStat?.hero;
    if (fallbackHero) {
      const {
        id,
        displayName,
        winRate,
        pickRate,
        banRate,
        matchCount,
        winCount,
        rank,
      } = fallbackHero;

      return {
        id,
        displayName,
        winRate,
        pickRate,
        banRate,
        matchCount,
        winCount,
        rank,
      };
    }

    console.error('Invalid response format from Stratz API (both main and fallback failed):', { result, fallbackResult });
    return null;
  } catch (error) {
    console.error('Error fetching hero stats from Stratz API:', error);
    return null;
  }
};

/**
 * Получение статистики побед всех героев за месяц через Stratz GraphQL API
 * 
 * @returns Map с ключом heroId и значением HeroWinStats или null при ошибке
 */
export const fetchAllHeroWinStats = async (): Promise<Map<number, HeroWinStats> | null> => {
  // Проверяем кеш в localStorage
  try {
    const cached = localStorage.getItem(HERO_WIN_STATS_CACHE_KEY);
    if (cached) {
      const parsed: CachedHeroWinStats = JSON.parse(cached);
      const now = Date.now();
      
      // Проверяем, что кеш свежий (меньше 6 часов) и данные не старше месяца
      const cacheAge = now - parsed.timestamp;
      const dataAge = parsed.dataTimestamp ? now - parsed.dataTimestamp : cacheAge;
      
      // Используем кеш только если:
      // 1. Кеш свежий (меньше TTL)
      // 2. Данные не старше месяца (или dataTimestamp не указан для обратной совместимости)
      if (cacheAge < HERO_WIN_STATS_CACHE_TTL && 
          dataAge < HERO_WIN_STATS_DATA_MAX_AGE && 
          Array.isArray(parsed.data)) {
        const statsMap = new Map<number, HeroWinStats>();
        parsed.data.forEach((stat: HeroWinStats) => {
          statsMap.set(stat.heroId, stat);
        });
        return statsMap;
      }
    }
  } catch (error) {
    console.warn('Error reading hero win stats cache from localStorage:', error);
  }

  try {
    const query = `
      query HeroStats {
        heroStats {
          winMonth {
            heroId
            winCount
            matchCount
          }
        }
      }
    `;

    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch hero win stats: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions.');
      }
      
      return null;
    }
    
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    if (result.data?.heroStats?.winMonth) {
      const statsMap = new Map<number, HeroWinStats>();
      result.data.heroStats.winMonth.forEach((stat: HeroWinStats) => {
        statsMap.set(stat.heroId, stat);
      });
      
      // Сохраняем в кеш с меткой времени получения данных
      try {
        const now = Date.now();
        const cache: CachedHeroWinStats = {
          data: result.data.heroStats.winMonth,
          timestamp: now, // Время получения данных с сервера
          dataTimestamp: now, // Время актуальности данных (считаем, что winMonth - это данные за последний месяц на момент получения)
        };
        localStorage.setItem(HERO_WIN_STATS_CACHE_KEY, JSON.stringify(cache));
      } catch (error) {
        console.warn('Error saving hero win stats cache to localStorage:', error);
      }
      
      return statsMap;
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching hero win stats from Stratz API:', error);
    return null;
  }
};

// Интерфейс для предмета из Stratz API
export interface StratzItem {
  id: number;
  displayName: string;
  shortName: string;
  stat: {
    isRecipe: boolean;
  };
}

// Интерфейс для предмета в формате приложения
// Примечание: id может быть и числом, и строкой для совместимости
export interface Item {
  id: number;
  name: string;
  displayName: string;
  shortName: string;
  cdnName?: string; // для совместимости с типами
}

// Кеш для items в localStorage
const ITEMS_CACHE_KEY = 'stratz_items_cache';
const ITEMS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа

interface CachedItems {
  data: Item[];
  timestamp: number;
}

/**
 * Получение списка предметов через Stratz GraphQL API
 * Фильтрует предметы-рецепты (isRecipe === true)
 * 
 * @returns Массив предметов или null при ошибке
 */
export const fetchItems = async (): Promise<Record<number, Item> | null> => {
  // Проверяем кеш в localStorage
  try {
    const cached = localStorage.getItem(ITEMS_CACHE_KEY);
    if (cached) {
      const parsed: CachedItems = JSON.parse(cached);
      const now = Date.now();
      
      // Если кеш свежий (меньше 24 часов), используем его
      if (now - parsed.timestamp < ITEMS_CACHE_TTL && Array.isArray(parsed.data)) {
        const itemsMap: Record<number, Item> = {};
        parsed.data.forEach((item: Item) => {
          itemsMap[item.id] = item;
        });
        return itemsMap;
      }
    }
  } catch (error) {
    console.warn('Error reading items cache from localStorage:', error);
  }
  
  try {
    // GraphQL запрос для получения предметов
    const query = `
      query GetItems {
        constants {
          items {
            id
            displayName
            shortName
            stat {
              isRecipe
            }
          }
        }
      }
    `;

    // Токен из переменной окружения или localStorage
    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch items: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions. Make sure VITE_STRATZ_API_KEY is set correctly.');
      }
      
      return null;
    }
    
    // Проверяем ошибки GraphQL
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    if (result.data?.constants?.items) {
      const items: StratzItem[] = result.data.constants.items;
      
      // Фильтруем предметы-рецепты (isRecipe === true исключаем)
      const filteredItems = items.filter(item => !item.stat?.isRecipe);
      
      // Преобразуем в формат приложения
      const itemsMap: Record<number, Item> = {};
      const itemsList: Item[] = [];
      
      filteredItems.forEach((item: StratzItem) => {
        const formattedItem: Item = {
          id: item.id,
          name: item.shortName.toLowerCase().replace(/\s+/g, '_'),
          displayName: item.displayName,
          shortName: item.shortName,
          cdnName: item.shortName, // для совместимости
        };
        itemsMap[item.id] = formattedItem;
        itemsList.push(formattedItem);
      });
      
      // Сохраняем в кеш
      try {
        const cache: CachedItems = {
          data: itemsList,
          timestamp: Date.now(),
        };
        localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify(cache));
      } catch (error) {
        console.warn('Error saving items cache to localStorage:', error);
      }
      
      return itemsMap;
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching items from Stratz API:', error);
    return null;
  }
};

/**
 * Получение URL изображения предмета
 * 
 * @param itemId - ID предмета (строка или число)
 * @param item - Объект предмета (опционально)
 * @returns URL изображения предмета
 */
export const getItemImageUrl = (itemId: string | number, item?: Item): string => {
  // Используем shortName для формирования URL через Steam CDN
  if (item?.shortName) {
    return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${item.shortName}.png`;
  }
  
  // Пробуем использовать name
  if (item?.name) {
    const itemName = item.name.replace(/^item_/, '').replace(/^npc_dota_item_/, '');
    return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${itemName}.png`;
  }
  
  // Fallback на стандартный CDN путь с ID
  const normalizedId = String(itemId).toLowerCase().replace(/\s+/g, '_');
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${normalizedId}.png`;
};

// Интерфейс для начального предмета из Stratz API
export interface HeroStartingItem {
  itemId: number;
  matchCount: number;
  winCount: number;
  winsAverage: number; // Винрейт в формате 0.511096918409708 (51.1%)
}

/**
 * Получение всех предметов героя одним запросом через Stratz GraphQL API
 * 
 * @param heroId - ID героя (число)
 * @returns Объект со всеми типами предметов или null при ошибке
 */
export interface HeroAllItems {
  boots: HeroStartingItem[];
  starting: HeroStartingItem[];
  early: HeroStartingItem[];
  mid: HeroStartingItem[];
  late: HeroStartingItem[];
}

export const fetchHeroAllItems = async (heroId: number): Promise<HeroAllItems | null> => {
  try {
    const query = `
      query GetAllHeroItems($heroId: Short!) {
        heroStats {
          boots: itemBootPurchase(heroId: $heroId) {
            itemId
            matchCount
            winCount
            winAverage
          }
          starting: itemStartingPurchase(heroId: $heroId) {
            itemId
            matchCount
            winCount
            winsAverage
          }
          early: itemFullPurchase(heroId: $heroId, minTime: 0, maxTime: 15) {
            itemId
            matchCount
            winCount
            winsAverage
          }
          mid: itemFullPurchase(heroId: $heroId, minTime: 15, maxTime: 35) {
            itemId
            matchCount
            winCount
            winsAverage
          }
          late: itemFullPurchase(heroId: $heroId, minTime: 35) {
            itemId
            matchCount
            winCount
            winsAverage
          }
        }
      }
    `;

    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { heroId },
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch hero all items: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions.');
      }
      
      return null;
    }
    
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    const data = result.data?.heroStats;
    if (data) {
      // Маппим winAverage в winsAverage для ботинок
      const boots = data.boots ? data.boots.map((item: { itemId: number; matchCount: number; winCount: number; winAverage?: number; winsAverage?: number }) => ({
        itemId: item.itemId,
        matchCount: item.matchCount,
        winCount: item.winCount,
        winsAverage: item.winAverage ?? item.winsAverage ?? 0,
      })) : [];
      
      return {
        boots: boots || [],
        starting: data.starting || [],
        early: data.early || [],
        mid: data.mid || [],
        late: data.late || [],
      };
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching hero all items from Stratz API:', error);
    return null;
  }
};

/**
 * Получение предметов ранней игры героя через Stratz GraphQL API (0:00 - 15:00)
 * 
 * @param heroId - ID героя (число)
 * @returns Массив предметов ранней игры или null при ошибке
 */
export const fetchHeroEarlyGameItems = async (heroId: number): Promise<HeroStartingItem[] | null> => {
  try {
    const query = `
      query GetItems($heroId: Short!) {
        heroStats {
          itemFullPurchase(heroId: $heroId, minTime: 0, maxTime: 15) {
            itemId
            matchCount
            winCount
            winsAverage
          }
        }
      }
    `;

    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { heroId },
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch hero early game items: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions.');
      }
      
      return null;
    }
    
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    if (result.data?.heroStats?.itemFullPurchase) {
      return result.data.heroStats.itemFullPurchase;
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching hero early game items from Stratz API:', error);
    return null;
  }
};

/**
 * Получение предметов мидгейма героя через Stratz GraphQL API (15:00 - 35:00)
 * 
 * @param heroId - ID героя (число)
 * @returns Массив предметов мидгейма или null при ошибке
 */
export const fetchHeroMidGameItems = async (heroId: number): Promise<HeroStartingItem[] | null> => {
  try {
    const query = `
      query GetItems($heroId: Short!) {
        heroStats {
          itemFullPurchase(heroId: $heroId, minTime: 15, maxTime: 35) {
            itemId
            matchCount
            winCount
            winsAverage
          }
        }
      }
    `;

    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { heroId },
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch hero mid game items: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions.');
      }
      
      return null;
    }
    
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    if (result.data?.heroStats?.itemFullPurchase) {
      return result.data.heroStats.itemFullPurchase;
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching hero mid game items from Stratz API:', error);
    return null;
  }
};

/**
 * Получение ботинок героя через Stratz GraphQL API
 * 
 * @param heroId - ID героя (число)
 * @returns Массив ботинок или null при ошибке
 */
export const fetchHeroBootItems = async (heroId: number): Promise<HeroStartingItem[] | null> => {
  try {
    const query = `
      query GetItems($heroId: Short!) {
        heroStats {
          itemBootPurchase(heroId: $heroId) {
            itemId
            matchCount
            winCount
            winAverage
          }
        }
      }
    `;

    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { heroId },
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch hero boot items: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions.');
      }
      
      return null;
    }
    
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    if (result.data?.heroStats?.itemBootPurchase) {
      // Маппим winAverage в winsAverage для совместимости с интерфейсом
      return result.data.heroStats.itemBootPurchase.map((item: { itemId: number; matchCount: number; winCount: number; winAverage?: number; winsAverage?: number }) => ({
        itemId: item.itemId,
        matchCount: item.matchCount,
        winCount: item.winCount,
        winsAverage: item.winAverage ?? item.winsAverage ?? 0,
      }));
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching hero boot items from Stratz API:', error);
    return null;
  }
};

/**
 * Получение предметов поздней игры героя через Stratz GraphQL API (35:00+)
 * 
 * @param heroId - ID героя (число)
 * @returns Массив предметов поздней игры или null при ошибке
 */
export const fetchHeroLateGameItems = async (heroId: number): Promise<HeroStartingItem[] | null> => {
  try {
    const query = `
      query GetItems($heroId: Short!) {
        heroStats {
          itemFullPurchase(heroId: $heroId, minTime: 35) {
            itemId
            matchCount
            winCount
            winsAverage
          }
        }
      }
    `;

    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { heroId },
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch hero late game items: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions.');
      }
      
      return null;
    }
    
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    if (result.data?.heroStats?.itemFullPurchase) {
      return result.data.heroStats.itemFullPurchase;
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching hero late game items from Stratz API:', error);
    return null;
  }
};

/**
 * Получение начальных предметов героя через Stratz GraphQL API
 * 
 * @param heroId - ID героя (число)
 * @returns Массив начальных предметов или null при ошибке
 */
export const fetchHeroStartingItems = async (heroId: number): Promise<HeroStartingItem[] | null> => {
  try {
    const query = `
      query GetItems($heroId: Short!) {
        heroStats {
          itemStartingPurchase(heroId: $heroId) {
            itemId
            matchCount
            winCount
            winsAverage
          }
        }
      }
    `;

    const apiKey = import.meta.env.VITE_STRATZ_API_KEY || localStorage.getItem('stratz_api_key');
    
    if (!apiKey) {
      console.error('Stratz API key is required. Set VITE_STRATZ_API_KEY in .env or localStorage.setItem("stratz_api_key", "your_key")');
      return null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(STRATZ_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { heroId },
      }),
    });
    
    let result;
    try {
      result = await response.json();
    } catch {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Failed to parse response: ${errorText}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`Failed to fetch hero starting items: ${response.status} ${response.statusText}`, result);
      
      if (response.status === 403) {
        console.error('403 Forbidden: Check if your API key is valid and has necessary permissions.');
      }
      
      return null;
    }
    
    if (result.errors) {
      console.error('GraphQL errors from Stratz API:', result.errors);
      return null;
    }
    
    if (result.data?.heroStats?.itemStartingPurchase) {
      return result.data.heroStats.itemStartingPurchase;
    } else {
      console.error('Invalid response format from Stratz API:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching hero starting items from Stratz API:', error);
    return null;
  }
};



