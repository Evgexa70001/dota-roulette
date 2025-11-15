import type { Hero } from '../types';
import { fetchHeroes as fetchHeroesFromAPI } from '../api/stratz';
import { setStratzHeroesCache } from './heroRoles';

// Кеш для списка героев
let heroesCache: Hero[] | null = null;

/**
 * Загружает список героев из Stratz API
 * 
 * @returns Массив героев или null при ошибке
 */
export const loadHeroes = async (): Promise<Hero[] | null> => {
  // Возвращаем кеш, если он уже загружен
  if (heroesCache) {
    return heroesCache;
  }

  try {
    const heroesData = await fetchHeroesFromAPI();
    
    if (!heroesData || heroesData.length === 0) {
      console.error('Failed to load heroes from Stratz API');
      return null;
    }

    // Преобразуем данные из API в формат Hero
    const heroes: Hero[] = heroesData
      .sort((a, b) => a.id - b.id) // Сортируем по ID
      .map(hero => ({
        id: hero.id.toString(),
        name: hero.displayName,
        displayName: hero.displayName,
        cdnName: hero.shortName,
      }));

    // Инициализируем кеш ролей из Stratz API
    setStratzHeroesCache(heroesData);

    // Сохраняем в кеш
    heroesCache = heroes;
    return heroes;
  } catch (error) {
    console.error('Error loading heroes from Stratz API:', error);
    return null;
  }
};

/**
 * Получает список героев (синхронный доступ к кешу)
 * ВНИМАНИЕ: Используйте только после вызова loadHeroes()
 * 
 * @returns Массив героев или пустой массив, если не загружены
 */
export const getHeroes = (): Hero[] => {
  return heroesCache || [];
};

/**
 * Экспорт для обратной совместимости
 * @deprecated Используйте loadHeroes() для загрузки данных из API
 */
export const heroes: Hero[] = [];

export const getHeroImageUrl = (cdnName: string): string => {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${cdnName}.png`;
};

