import type { HeroRole } from '../types';
import { getHeroRolesFromStratz } from '../api/stratz';
import type { StratzHero } from '../api/stratz';

// Кеш для ролей из Stratz API
let stratzHeroesCache: StratzHero[] | null = null;

/**
 * Инициализация кеша героев из Stratz API
 * Вызывается при загрузке данных из API
 */
export const setStratzHeroesCache = (heroes: StratzHero[]): void => {
  stratzHeroesCache = heroes;
};

/**
 * Получение ролей для героя по его displayName
 * Использует только данные из Stratz API
 * 
 * @param heroName - Имя героя (displayName)
 * @returns Массив ролей или пустой массив, если герой не найден или данных нет
 */
export const getHeroRoles = (heroName: string): HeroRole[] => {
  // Получаем роли только из Stratz API
  if (stratzHeroesCache) {
    const hero = stratzHeroesCache.find(h => h.displayName === heroName);
    if (hero) {
      return getHeroRolesFromStratz(hero);
    }
  }
  
  // Если данных нет - возвращаем пустой массив
  return [];
};

