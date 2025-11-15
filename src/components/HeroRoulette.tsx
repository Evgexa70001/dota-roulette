import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { loadHeroes, getHeroImageUrl } from '../data/heroes';
import { getHeroRoles } from '../data/heroRoles';
import type { Hero, HeroRole } from '../types';
import { fetchItems, getItemImageUrl, type Item, fetchHeroAllItems, type HeroStartingItem } from '../api/stratz';
import { fetchAllHeroWinStats, type HeroWinStats } from '../api/stratz';
import { getAIRecommendations, type AIRecommendationResponse } from '../api/openrouter';
import './HeroRoulette.css';

const BASE_SPIN_DURATION = 8200; // базовая длительность плавного спина
const SPIN_DURATION_PER_LOOP = 1800; // бонус ко времени за каждый дополнительный цикл
const DEFAULT_HERO_SLOT_WIDTH = 168; // 140px ширина + 28px margin (14px с каждой стороны)
const REPEAT_COUNT = 6; // Повторяем список героев, чтобы обеспечить плавные вращения
const withBase = (relativePath: string) => {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${relativePath.replace(/^\//, '')}`;
};

const TICK_SOUND_URL = withBase('audio/go-new-gambling.mp3');
const FINISH_SOUND_URL = withBase('audio/gambling.mp3');

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const shuffleList = <T,>(source: T[]): T[] => {
  const array = [...source];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const buildLoopedHeroes = (base: Hero[]): Hero[] => {
  if (!base.length) return [];
  return Array.from({ length: REPEAT_COUNT }, () => base).flat();
};

const roleLabels: Record<HeroRole, string> = {
  'carry': 'Керри (Pos 1)',
  'mid': 'Мид (Pos 2)',
  'offlane': 'Оффлейн (Pos 3)',
  'soft-support': 'Полу-саппорт (Pos 4)',
  'hard-support': 'Саппорт (Pos 5)',
};

// Функция для форматирования числа в миллионы
const formatMatchCount = (count: number): string => {
  if (count >= 1000000) {
    const millions = count / 1000000;
    // Для дробных чисел используем единственное число
    if (millions % 1 === 0) {
      return `${millions.toFixed(0)} миллионов`;
    }
    return `${millions.toFixed(1)} миллиона`;
  } else if (count >= 1000) {
    const thousands = count / 1000;
    // Для дробных чисел используем единственное число
    if (thousands % 1 === 0) {
      return `${thousands.toFixed(0)} тысяч`;
    }
    return `${thousands.toFixed(1)} тысячи`;
  }
  return count.toString();
};



export const HeroRoulette: React.FC = () => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedHero, setSelectedHero] = useState<Hero | null>(null);
  const [baseHeroesState, setBaseHeroesState] = useState<Hero[]>([]);
  const [heroSlotWidth, setHeroSlotWidth] = useState(DEFAULT_HERO_SLOT_WIDTH);
  const [selectedRoles, setSelectedRoles] = useState<HeroRole[]>([]);
  const [bannedHeroIds, setBannedHeroIds] = useState<Set<string>>(() => new Set());
  const [isBanPanelOpen, setIsBanPanelOpen] = useState(false);
  const [heroSearchTerm, setHeroSearchTerm] = useState('');
  const [itemsMap, setItemsMap] = useState<Record<string | number, Item>>({});
  const [heroRolesFromAPI, setHeroRolesFromAPI] = useState<HeroRole[] | null>(null);
  const [heroesRolesMap, setHeroesRolesMap] = useState<Record<string, HeroRole[]>>({});
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [isLoadingHeroes, setIsLoadingHeroes] = useState(true);
  const [heroWinStatsMap, setHeroWinStatsMap] = useState<Map<number, HeroWinStats>>(new Map());
  const [heroItems, setHeroItems] = useState<{ boots: HeroStartingItem[]; starting: HeroStartingItem[]; early: HeroStartingItem[]; mid: HeroStartingItem[]; late: HeroStartingItem[] } | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [myTeamHeroes, setMyTeamHeroes] = useState<Hero[]>([]);
  const [enemyTeamHeroes, setEnemyTeamHeroes] = useState<Hero[]>([]);
  const [myTeamSearchTerm, setMyTeamSearchTerm] = useState('');
  const [enemyTeamSearchTerm, setEnemyTeamSearchTerm] = useState('');
  const [aiRecommendations, setAiRecommendations] = useState<AIRecommendationResponse | null>(null);
  const [isLoadingAIRecommendations, setIsLoadingAIRecommendations] = useState(false);
  const rouletteRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const tickBufferRef = useRef<AudioBuffer | null>(null);
  const finishBufferRef = useRef<AudioBuffer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isSpinningRef = useRef(false);
  const heroSlotWidthRef = useRef(DEFAULT_HERO_SLOT_WIDTH);

  // Загрузка списка героев, их ролей и статистики побед при монтировании компонента
  useEffect(() => {
    const loadHeroesData = async () => {
      setIsLoadingHeroes(true);
      
      // Загружаем героев и статистику побед параллельно
      const [heroesData, winStatsData] = await Promise.all([
        loadHeroes(),
        fetchAllHeroWinStats(),
      ]);
      
      if (heroesData) {
        setHeroes(heroesData);
        
        // Создаем карту ролей для всех героев (использует данные из Stratz API или fallback на хардкод)
        const rolesMap: Record<string, HeroRole[]> = {};
        heroesData.forEach((hero) => {
          rolesMap[hero.displayName] = getHeroRoles(hero.displayName);
        });
        
        setHeroesRolesMap(rolesMap);
      } else {
        // Fallback на пустой массив при ошибке
        setHeroes([]);
        setHeroesRolesMap({});
      }
      
      if (winStatsData) {
        setHeroWinStatsMap(winStatsData);
      }
      
      setIsLoadingHeroes(false);
    };
    loadHeroesData();
  }, []);


  const loopedHeroes = useMemo(() => buildLoopedHeroes(baseHeroesState), [baseHeroesState]);
  const roleOptions = useMemo(() => Object.keys(roleLabels) as HeroRole[], []);

  const activeHeroes = useMemo(() => {
    const baseList =
      selectedRoles.length === 0
        ? heroes
        : heroes.filter(hero => {
            const heroRolesList = heroesRolesMap[hero.displayName] || [];
            return heroRolesList.some(role => selectedRoles.includes(role));
          });

    if (bannedHeroIds.size === 0) {
      return baseList;
    }

    return baseList.filter(hero => !bannedHeroIds.has(hero.id));
  }, [selectedRoles, bannedHeroIds, heroes, heroesRolesMap]);

  const toggleHeroBan = useCallback(
    (heroId: string) => {
      if (isSpinning) return;
      setBannedHeroIds(prev => {
        const next = new Set(prev);
        if (next.has(heroId)) {
          next.delete(heroId);
        } else {
          next.add(heroId);
        }
        return next;
      });
    },
    [isSpinning],
  );

  const clearHeroBans = useCallback(() => {
    setBannedHeroIds(new Set());
  }, []);

  // Функции для работы с выбором героев в модальном окне ИИ
  const addHeroToMyTeam = useCallback((hero: Hero) => {
    if (myTeamHeroes.length >= 5) return;
    if (myTeamHeroes.some(h => h.id === hero.id)) return;
    if (enemyTeamHeroes.some(h => h.id === hero.id)) return;
    setMyTeamHeroes(prev => [...prev, hero]);
  }, [myTeamHeroes, enemyTeamHeroes]);

  const removeHeroFromMyTeam = useCallback((heroId: string) => {
    setMyTeamHeroes(prev => prev.filter(h => h.id !== heroId));
  }, []);

  const addHeroToEnemyTeam = useCallback((hero: Hero) => {
    if (enemyTeamHeroes.length >= 5) return;
    if (enemyTeamHeroes.some(h => h.id === hero.id)) return;
    if (myTeamHeroes.some(h => h.id === hero.id)) return;
    setEnemyTeamHeroes(prev => [...prev, hero]);
  }, [myTeamHeroes, enemyTeamHeroes]);

  const removeHeroFromEnemyTeam = useCallback((heroId: string) => {
    setEnemyTeamHeroes(prev => prev.filter(h => h.id !== heroId));
  }, []);

  // Фильтрация героев для поиска в модальном окне
  const filteredMyTeamHeroes = useMemo(() => {
    const availableHeroes = heroes.filter(hero => 
      !myTeamHeroes.some(h => h.id === hero.id) &&
      !enemyTeamHeroes.some(h => h.id === hero.id)
    );
    const trimmed = myTeamSearchTerm.trim().toLowerCase();
    if (!trimmed) return availableHeroes;
    return availableHeroes.filter(hero => 
      hero.displayName.toLowerCase().includes(trimmed)
    );
  }, [myTeamSearchTerm, heroes, myTeamHeroes, enemyTeamHeroes]);

  const filteredEnemyTeamHeroes = useMemo(() => {
    const availableHeroes = heroes.filter(hero => 
      !myTeamHeroes.some(h => h.id === hero.id) &&
      !enemyTeamHeroes.some(h => h.id === hero.id)
    );
    const trimmed = enemyTeamSearchTerm.trim().toLowerCase();
    if (!trimmed) return availableHeroes;
    return availableHeroes.filter(hero => 
      hero.displayName.toLowerCase().includes(trimmed)
    );
  }, [enemyTeamSearchTerm, heroes, myTeamHeroes, enemyTeamHeroes]);

  const filteredBanHeroes = useMemo(() => {
    const trimmed = heroSearchTerm.trim().toLowerCase();
    const list = !trimmed
      ? heroes
      : heroes.filter(hero => hero.displayName.toLowerCase().includes(trimmed));

    if (bannedHeroIds.size === 0) {
      return list;
    }

    return [...list].sort((a, b) => {
      const aBanned = bannedHeroIds.has(a.id) ? 1 : 0;
      const bBanned = bannedHeroIds.has(b.id) ? 1 : 0;
      return bBanned - aBanned || a.displayName.localeCompare(b.displayName, 'ru');
    });
  }, [heroSearchTerm, bannedHeroIds, heroes]);

  useEffect(() => {
    if (!selectedHero) return;
    if (!bannedHeroIds.has(selectedHero.id)) return;
    setSelectedHero(null);
  }, [bannedHeroIds, selectedHero]);

  // Загрузка списка предметов при монтировании компонента
  useEffect(() => {
    const loadItems = async () => {
      const items = await fetchItems();
      if (items) {
        // Преобразуем ключи в строки и числа для удобства поиска
        const itemsMapWithStringKeys: Record<string | number, Item> = {};
        Object.entries(items).forEach(([key, value]) => {
          const numKey = parseInt(key, 10);
          // Сохраняем по числовому ключу
          itemsMapWithStringKeys[numKey] = value;
          // Также добавляем по строковому ключу для совместимости
          itemsMapWithStringKeys[key] = value;
          // И по строковому ID предмета
          itemsMapWithStringKeys[value.id.toString()] = value;
        });
        setItemsMap(itemsMapWithStringKeys);
      }
    };
    loadItems();
  }, []);

  // Стабильные значения для зависимостей
  const selectedHeroId = selectedHero?.id ?? null;
  const selectedHeroDisplayName = selectedHero?.displayName ?? null;

  // Запрос ролей для выпавшего героя
  useEffect(() => {
    if (!selectedHero || !selectedHeroDisplayName) {
      setHeroRolesFromAPI(null);
      return;
    }
    
    const loadHeroRoles = () => {
      // Получаем роли из Stratz API (через getHeroRoles, которая использует кеш из API или fallback на хардкод)
      const rolesData = getHeroRoles(selectedHeroDisplayName);
      
      if (rolesData && rolesData.length > 0) {
        setHeroRolesFromAPI(rolesData);
      } else {
        // Fallback на роли из загруженной карты или пустой массив
        const cachedRoles = heroesRolesMap[selectedHeroDisplayName] || [];
        setHeroRolesFromAPI(cachedRoles.length > 0 ? cachedRoles : null);
      }
    };
    
    loadHeroRoles();
  }, [selectedHero, selectedHeroId, selectedHeroDisplayName, heroesRolesMap]);

  // Функция фильтрации предметов (убираем дубликаты и только с винрейтом >= minWinRate)
  const filterItems = useCallback((items: HeroStartingItem[], minWinRate: number = 0.5): HeroStartingItem[] => {
    const uniqueItems = new Map<number, HeroStartingItem>();
    items.forEach(item => {
      // Проверяем винрейт >= minWinRate
      if (item.winsAverage >= minWinRate) {
        // Если предмет уже есть, берем тот, у которого больше матчей
        const existing = uniqueItems.get(item.itemId);
        if (!existing || item.matchCount > existing.matchCount) {
          uniqueItems.set(item.itemId, item);
        }
      }
    });
    // Сортируем по винрейту от большего к меньшему
    return Array.from(uniqueItems.values()).sort((a, b) => b.winsAverage - a.winsAverage);
  }, []);

  // Загрузка всех предметов для выбранного героя одним запросом
  const loadHeroItems = useCallback(async (heroId: number) => {
    setIsLoadingItems(true);
    setShowItems(true);
    try {
      // Загружаем все типы предметов одним запросом
      const allItems = await fetchHeroAllItems(heroId);

      if (allItems) {
        setHeroItems({
          boots: filterItems(allItems.boots),
          starting: filterItems(allItems.starting, 0.4), // 40% для начальных предметов
          early: filterItems(allItems.early),
          mid: filterItems(allItems.mid),
          late: filterItems(allItems.late),
        });
      } else {
        setHeroItems({ boots: [], starting: [], early: [], mid: [], late: [] });
      }
    } catch (error) {
      console.error('Error loading hero items:', error);
      setHeroItems({ boots: [], starting: [], early: [], mid: [], late: [] });
    } finally {
      setIsLoadingItems(false);
    }
  }, [filterItems]);

  // Сброс предметов при смене героя
  useEffect(() => {
    if (!selectedHero) {
      setHeroItems(null);
      setShowItems(false);
      setAiRecommendations(null);
    }
  }, [selectedHero]);



  const activeHeroCount = activeHeroes.length;
  const totalHeroCount = heroes.length;
  const safeHeroCount = Math.max(activeHeroCount, 1);

  const middleRepeatIndex = Math.floor(REPEAT_COUNT / 2);
  const initialOffset = -(middleRepeatIndex * safeHeroCount * heroSlotWidth);

  const baseHeroesRef = useRef<Hero[]>([]);
  const virtualOffsetRef = useRef(initialOffset);

  const toggleRole = (role: HeroRole) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role],
    );
  };

  const clearRoles = () => setSelectedRoles([]);
  const hasRoleSelection = selectedRoles.length > 0;

  const heroCountLabel = useMemo(() => {
    const count = activeHeroCount;
    const lastTwo = count % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return 'героев';

    const last = count % 10;
    if (last === 1) return 'герой';
    if (last >= 2 && last <= 4) return 'героя';
    return 'героев';
  }, [activeHeroCount]);

  const measureHeroSlotWidth = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!rouletteRef.current) return;

    const firstHero = rouletteRef.current.querySelector('.roulette-hero') as HTMLElement | null;
    if (!firstHero) return;

    const rect = firstHero.getBoundingClientRect();
    if (!rect.width) return;

    const styles = window.getComputedStyle(firstHero);
    const marginLeft = parseFloat(styles.marginLeft) || 0;
    const marginRight = parseFloat(styles.marginRight) || 0;
    const computedWidth = rect.width + marginLeft + marginRight;

    if (!Number.isFinite(computedWidth) || computedWidth <= 0) return;
    if (Math.abs(computedWidth - heroSlotWidthRef.current) <= 0.5) return;

    heroSlotWidthRef.current = computedWidth;
    setHeroSlotWidth(computedWidth);
  }, []);

  const applyVisualOffset = useCallback(
    (rawOffset: number) => {
      virtualOffsetRef.current = rawOffset;
      const slotWidth = heroSlotWidthRef.current;
      const baseLength = baseHeroesRef.current.length;

      if (!rouletteRef.current) return;
      if (!slotWidth || !baseLength) {
        rouletteRef.current.style.transform = `translate3d(${rawOffset}px, 0, 0)`;
        return;
      }

      const loopWidth = baseLength * slotWidth;
      const offsetWithinLoop = ((rawOffset % loopWidth) + loopWidth) % loopWidth;
      const visualOffset = offsetWithinLoop - middleRepeatIndex * loopWidth;
      rouletteRef.current.style.transform = `translate3d(${visualOffset}px, 0, 0)`;
    },
    [middleRepeatIndex],
  );

  useLayoutEffect(() => {
    if (loopedHeroes.length === 0) return;
    if (typeof window === 'undefined') return;

    const handleMeasure = () => {
      measureHeroSlotWidth();
    };

    handleMeasure();

    let resizeRaf = 0;
    const resizeHandler = () => {
      if (resizeRaf) {
        window.cancelAnimationFrame(resizeRaf);
      }
      resizeRaf = window.requestAnimationFrame(handleMeasure);
    };

    window.addEventListener('resize', resizeHandler);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      const firstHero = rouletteRef.current?.querySelector('.roulette-hero');
      if (firstHero) {
        observer = new ResizeObserver(() => resizeHandler());
        observer.observe(firstHero);
      }
    }

    return () => {
      if (resizeRaf) {
        window.cancelAnimationFrame(resizeRaf);
      }
      window.removeEventListener('resize', resizeHandler);
      observer?.disconnect();
    };
  }, [measureHeroSlotWidth, loopedHeroes.length]);

  useEffect(() => {
    const sourceHeroes = activeHeroes.length > 0 ? activeHeroes : heroes;
    const shuffled = shuffleList(sourceHeroes);
    baseHeroesRef.current = shuffled;
    setBaseHeroesState(shuffled);
  }, [activeHeroes, heroes]);

  useEffect(() => {
    if (isSpinningRef.current) return;
    if (selectedHero) return;
    requestAnimationFrame(() => {
      applyVisualOffset(initialOffset);
    });
  }, [initialOffset, applyVisualOffset, selectedHero]);

  useEffect(() => {
    // Инициализируем AudioContext
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = new AudioContextClass();
      }
    }

    const ctx = audioContextRef.current;

    const decodeAudio = (context: AudioContext, data: ArrayBuffer) =>
      new Promise<AudioBuffer>((resolve, reject) => {
        context.decodeAudioData(data, resolve, reject);
      });

    const loadBuffers = async () => {
      if (!ctx) return;
      try {
        const [tickResponse, finishResponse] = await Promise.all([
          fetch(TICK_SOUND_URL),
          fetch(FINISH_SOUND_URL),
        ]);

        if (!tickResponse.ok || !finishResponse.ok) {
          throw new Error('Не удалось загрузить звуки рулетки');
        }

        const [tickData, finishData] = await Promise.all([
          tickResponse.arrayBuffer(),
          finishResponse.arrayBuffer(),
        ]);

        const [tickBuffer, finishBuffer] = await Promise.all([
          decodeAudio(ctx, tickData),
          decodeAudio(ctx, finishData),
        ]);

        tickBufferRef.current = tickBuffer;
        finishBufferRef.current = finishBuffer;
      } catch {
        // Ошибка загрузки звуков
      }
    };

    loadBuffers();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Функция для воспроизведения звука тика
  const playTickSound = (speedRatio: number) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    if (!tickBufferRef.current) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const source = ctx.createBufferSource();
    source.buffer = tickBufferRef.current;
    source.playbackRate.value = 0.8 + speedRatio * 0.35;

    const gainNode = ctx.createGain();
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0.18 + speedRatio * 0.08, now);
    gainNode.gain.exponentialRampToValueAtTime(0.02, now + 0.25);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    const maxDuration = Math.min(tickBufferRef.current.duration, 0.35);
    source.start(0, 0, maxDuration);
  };

  // Функция для воспроизведения финального звука
  const playWinSound = () => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    if (!finishBufferRef.current) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const source = ctx.createBufferSource();
    source.buffer = finishBufferRef.current;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start();
  };

  const mapProgressToDistance = (progress: number) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;

    const clamped = Math.min(Math.max(progress, 0), 1);
    if (clamped < 0.5) {
      return 16 * Math.pow(clamped, 5);
    }

    const mirrored = -2 * clamped + 2;
    return 1 - Math.pow(mirrored, 5) / 2;
  };

  const spinRoulette = () => {
    if (isSpinningRef.current) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    isSpinningRef.current = true;
    setIsSpinning(true);
    setSelectedHero(null);

    measureHeroSlotWidth();

    const slotWidth = heroSlotWidthRef.current;
    const availableHeroes = activeHeroes.length > 0 ? activeHeroes : heroes;
    const shuffledHeroes = shuffleList(availableHeroes);
    baseHeroesRef.current = shuffledHeroes;
    setBaseHeroesState(shuffledHeroes);

    const availableCount = shuffledHeroes.length;

    if (availableCount === 0) {
      isSpinningRef.current = false;
      setIsSpinning(false);
      return;
    }

    let randomIndex = Math.floor(Math.random() * availableCount);

    if (availableCount > 1 && randomIndex === 0 && Math.random() < 0.35) {
      randomIndex = 1 + Math.floor(Math.random() * (availableCount - 1));
    }

    const startOffset = -(middleRepeatIndex * availableCount * slotWidth);
    applyVisualOffset(startOffset);

    const baselineIndex = middleRepeatIndex * availableCount;
    const extraLoops = 2 + Math.floor(Math.random() * 4);

    const randomHero = shuffledHeroes[randomIndex];
    const spinDuration = BASE_SPIN_DURATION + extraLoops * SPIN_DURATION_PER_LOOP;

    const targetIndex = baselineIndex + extraLoops * availableCount + randomIndex;
    const finalOffset = -(targetIndex * slotWidth);
    const totalDistance = finalOffset - startOffset;

    let animationStart = 0;
    let lastHeroIndex = -1;

    const step = (timestamp: number) => {
      if (!animationStart) {
        animationStart = timestamp;
      }

      const elapsed = timestamp - animationStart;
      const progress = Math.min(elapsed / spinDuration, 1);
      const easedProgress = mapProgressToDistance(progress);
      const currentOffset = startOffset + totalDistance * easedProgress;

      applyVisualOffset(currentOffset);

      const baseLength = shuffledHeroes.length;
      if (slotWidth > 0 && baseLength > 0) {
        const rawIndex = Math.floor(-currentOffset / slotWidth);
        const heroIndex = ((rawIndex % baseLength) + baseLength) % baseLength;
        if (heroIndex !== lastHeroIndex) {
          const speedRatio = Math.max(0.05, 1 - progress);
          playTickSound(speedRatio);
          lastHeroIndex = heroIndex;
        }
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
        isSpinningRef.current = false;
        setIsSpinning(false);
        applyVisualOffset(finalOffset);

        setSelectedHero(randomHero);
        playWinSound();
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  };

  const resetRoulette = () => {
    setSelectedHero(null);
    const sourceHeroes = activeHeroes.length > 0 ? activeHeroes : heroes;
    const shuffled = shuffleList(sourceHeroes);
    baseHeroesRef.current = shuffled;
    setBaseHeroesState(shuffled);
    // Сбрасываем на начальную позицию (первый герой из среднего повтора)
    applyVisualOffset(initialOffset);
  };


  // Показываем индикатор загрузки, пока герои загружаются
  if (isLoadingHeroes) {
    return (
      <div className="hero-roulette">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '400px',
          fontSize: '1.2rem',
          color: 'white'
        }}>
          Загрузка героев из Stratz API...
        </div>
      </div>
    );
  }

  return (
    <div className="hero-roulette">

      <div className="role-filter">
        <div className="role-filter-header">
          <h3>Выбор ролей</h3>
          <button
            type="button"
            className="role-filter-reset"
            onClick={clearRoles}
            disabled={!hasRoleSelection || isSpinning}
          >
            Сбросить
          </button>
        </div>
        <div className="role-filter-options">
          {roleOptions.map(role => {
            const checked = selectedRoles.includes(role);
            return (
              <label
                key={role}
                className={`role-filter-option ${checked ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRole(role)}
                  disabled={isSpinning}
                />
                <span>{roleLabels[role]}</span>
              </label>
            );
          })}
        </div>
        <div className="role-filter-stats">
          {selectedRoles.length > 0 || bannedHeroIds.size > 0 ? (
            <>
              {activeHeroCount} {heroCountLabel} в пуле
              {totalHeroCount > 0 && ` (из ${totalHeroCount} всего)`}
            </>
          ) : (
            <>
              {totalHeroCount} {totalHeroCount === 1 ? 'герой' : totalHeroCount >= 2 && totalHeroCount <= 4 ? 'героя' : 'героев'} в пуле
            </>
          )}
        </div>
      </div>

      <div className="hero-ban-filter">
        <button
          type="button"
          className={`hero-ban-toggle ${isBanPanelOpen ? 'open' : ''}`}
          onClick={() => setIsBanPanelOpen(prev => !prev)}
        >
          {isBanPanelOpen ? 'Скрыть бан героев' : 'Бан героев'}
          {bannedHeroIds.size > 0 ? ` (${bannedHeroIds.size})` : ''}
        </button>

        {isBanPanelOpen && (
          <div className="hero-ban-panel">
            <div className="hero-ban-controls">
              <input
                type="text"
                className="hero-ban-search"
                placeholder="Найти героя..."
                value={heroSearchTerm}
                onChange={event => setHeroSearchTerm(event.target.value)}
              />
              <button
                type="button"
                className="hero-ban-clear"
                onClick={clearHeroBans}
                disabled={bannedHeroIds.size === 0}
              >
                Очистить бан
              </button>
            </div>

            <div className="hero-ban-grid">
              {filteredBanHeroes.map(hero => {
                const isBanned = bannedHeroIds.has(hero.id);
                return (
                  <button
                    key={hero.id}
                    type="button"
                    className={`hero-ban-card ${isBanned ? 'banned' : ''}`}
                    onClick={() => toggleHeroBan(hero.id)}
                    disabled={isSpinning}
                    title={isBanned ? 'Нажми, чтобы снять бан' : 'Нажми, чтобы забанить'}
                  >
                    <img src={getHeroImageUrl(hero.cdnName)} alt={hero.displayName} />
                    <span>{hero.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="roulette-container">
        <div className="roulette-viewport">
          {/* Центральная линия указателя */}
          <div className="roulette-pointer"></div>
          
          <div 
            ref={rouletteRef}
            className="roulette-strip"
          >
            {loopedHeroes.map((hero, index) => (
              <div key={`${hero.id}-${index}`} className="roulette-hero">
                <img 
                  src={getHeroImageUrl(hero.cdnName)} 
                  alt={hero.displayName}
                />
                <span className="roulette-hero-name">{hero.displayName}</span>
              </div>
            ))}
            {loopedHeroes.length === 0 && (
              <div className="roulette-empty">
                Нет героев для выбранных ролей
              </div>
            )}
          </div>
          <div className="roulette-overlay" aria-hidden="true"></div>
          <div className="roulette-pointer" aria-hidden="true"></div>
        </div>

        <button
          className={`spin-button ${isSpinning ? 'spinning' : ''}`}
          onClick={spinRoulette}
          disabled={isSpinning || activeHeroCount === 0}
        >
          {isSpinning ? '⏳ Крутится...' : '🎲 Крутить рулетку'}
        </button>
      </div>

      {selectedHero && !isSpinning && (
        <div className="roulette-result">
          <h3>🎉 Выпал герой:</h3>
          <div className="selected-hero-card">
            <img 
              src={getHeroImageUrl(selectedHero.cdnName)} 
              alt={selectedHero.displayName}
              className="selected-hero-image"
            />
            <h2>{selectedHero.displayName}</h2>
            
            {/* Статистика побед */}
            {(() => {
              const heroId = parseInt(selectedHero.id, 10);
              const winStats = heroWinStatsMap.get(heroId);
              if (winStats && winStats.matchCount > 0) {
                const winRate = (winStats.winCount / winStats.matchCount) * 100;
                return (
                  <div className="hero-win-stats">
                    <div className="hero-win-stats-label">Процент побед</div>
                    <div className="hero-win-stats-value">
                      {winRate.toFixed(1)}%
                    </div>
                    <div className="hero-win-stats-matches">
                      {formatMatchCount(winStats.matchCount)} матчей
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            
            <div className="recommended-roles">
              <h4>Рекомендуемые роли:</h4>
              <div className="roles-list">
                {heroRolesFromAPI && heroRolesFromAPI.length > 0 ? (
                  heroRolesFromAPI.map(role => (
                    <div key={role} className="role-badge">
                      {roleLabels[role]}
                    </div>
                  ))
                ) : (
                  <div className="role-badge">Загрузка...</div>
                )}
              </div>
            </div>

            <button 
              className="reset-button" 
              onClick={resetRoulette}
              style={{ marginBottom: '10px' }}
            >
              🔄 Крутить снова
            </button>

            <button 
              className="reset-button" 
              onClick={() => {
                if (selectedHero) {
                  loadHeroItems(parseInt(selectedHero.id, 10));
                }
              }}
              disabled={isLoadingItems}
            >
              {isLoadingItems ? '⏳ Загрузка...' : '📦 Посмотреть популярные предметы'}
            </button>
          </div>
        </div>
      )}

      {/* Отображение всех предметов отдельно от карточки */}
      {selectedHero && showItems && (
        <>
        <div className="hero-starting-items">
          {isLoadingItems ? (
            <div style={{ color: 'white', padding: '20px', textAlign: 'center' }}>
              Загрузка предметов...
            </div>
          ) : heroItems ? (
            <>
              {/* Кнопка получения рекомендаций от ИИ */}
              <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <button 
                  className="reset-button" 
                  onClick={() => {
                    if (selectedHero) {
                      // Предзаполняем выбранного героя в нашу команду
                      setMyTeamHeroes([selectedHero]);
                      setEnemyTeamHeroes([]);
                      setIsAIModalOpen(true);
                    }
                  }}
                >
                  🤖 Получить рекомендации от ИИ
                </button>
              </div>

              {/* Ботинки */}
              {heroItems.boots.length > 0 && (
                <div className="items-phase-section">
                  <h4>Ботинки</h4>
                  <div className="starting-items-grid">
                    {heroItems.boots
                      .sort((a, b) => b.winsAverage - a.winsAverage)
                      .map((itemData) => {
                        const item = itemsMap[itemData.itemId];
                        if (!item) return null;
                        const winRate = (itemData.winsAverage * 100).toFixed(1);
                        return (
                          <div key={`boots-${itemData.itemId}`} className="starting-item-card">
                            <div className="starting-item-image">
                              <img 
                                src={getItemImageUrl(itemData.itemId, item)}
                                alt={item.displayName}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                            <div className="starting-item-info">
                              <div className="starting-item-name">{item.displayName}</div>
                              <div className="starting-item-stats">
                                <div>Винрейт: {winRate}%</div>
                                <div>{formatMatchCount(itemData.matchCount)} матчей</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Начальная игра */}
              {heroItems.starting.length > 0 && (
                <div className="items-phase-section">
                  <h4>Начальная игра: (-1:40)</h4>
                  <div className="starting-items-grid">
                    {heroItems.starting
                      .sort((a, b) => b.winsAverage - a.winsAverage)
                      .map((itemData) => {
                        const item = itemsMap[itemData.itemId];
                        if (!item) return null;
                        const winRate = (itemData.winsAverage * 100).toFixed(1);
                        return (
                          <div key={`starting-${itemData.itemId}`} className="starting-item-card">
                            <div className="starting-item-image">
                              <img 
                                src={getItemImageUrl(itemData.itemId, item)}
                                alt={item.displayName}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                            <div className="starting-item-info">
                              <div className="starting-item-name">{item.displayName}</div>
                              <div className="starting-item-stats">
                                <div>Винрейт: {winRate}%</div>
                                <div>{formatMatchCount(itemData.matchCount)} матчей</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Ранняя игра */}
              {heroItems.early.length > 0 && (
                <div className="items-phase-section">
                  <h4>Ранняя игра (0:00 - 15:00)</h4>
                  <div className="starting-items-grid">
                    {heroItems.early
                      .sort((a, b) => b.winsAverage - a.winsAverage)
                      .map((itemData) => {
                        const item = itemsMap[itemData.itemId];
                        if (!item) return null;
                        const winRate = (itemData.winsAverage * 100).toFixed(1);
                        return (
                          <div key={`early-${itemData.itemId}`} className="starting-item-card">
                            <div className="starting-item-image">
                              <img 
                                src={getItemImageUrl(itemData.itemId, item)}
                                alt={item.displayName}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                            <div className="starting-item-info">
                              <div className="starting-item-name">{item.displayName}</div>
                              <div className="starting-item-stats">
                                <div>Винрейт: {winRate}%</div>
                                <div>{formatMatchCount(itemData.matchCount)} матчей</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Мидгейм */}
              {heroItems.mid.length > 0 && (
                <div className="items-phase-section">
                  <h4>Мидгейм (15:00 - 35:00)</h4>
                  <div className="starting-items-grid">
                    {heroItems.mid
                      .sort((a, b) => b.winsAverage - a.winsAverage)
                      .map((itemData) => {
                        const item = itemsMap[itemData.itemId];
                        if (!item) return null;
                        const winRate = (itemData.winsAverage * 100).toFixed(1);
                        return (
                          <div key={`mid-${itemData.itemId}`} className="starting-item-card">
                            <div className="starting-item-image">
                              <img 
                                src={getItemImageUrl(itemData.itemId, item)}
                                alt={item.displayName}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                            <div className="starting-item-info">
                              <div className="starting-item-name">{item.displayName}</div>
                              <div className="starting-item-stats">
                                <div>Винрейт: {winRate}%</div>
                                <div>{formatMatchCount(itemData.matchCount)} матчей</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Поздняя игра */}
              {heroItems.late.length > 0 && (
                <div className="items-phase-section">
                  <h4>Поздняя игра (35:00+)</h4>
                  <div className="starting-items-grid">
                    {heroItems.late
                      .sort((a, b) => b.winsAverage - a.winsAverage)
                      .map((itemData) => {
                        const item = itemsMap[itemData.itemId];
                        if (!item) return null;
                        const winRate = (itemData.winsAverage * 100).toFixed(1);
                        return (
                          <div key={`late-${itemData.itemId}`} className="starting-item-card">
                            <div className="starting-item-image">
                              <img 
                                src={getItemImageUrl(itemData.itemId, item)}
                                alt={item.displayName}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                            <div className="starting-item-info">
                              <div className="starting-item-name">{item.displayName}</div>
                              <div className="starting-item-stats">
                                <div>Винрейт: {winRate}%</div>
                                <div>{formatMatchCount(itemData.matchCount)} матчей</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {heroItems.boots.length === 0 && heroItems.starting.length === 0 && heroItems.early.length === 0 && heroItems.mid.length === 0 && heroItems.late.length === 0 && (
                <div style={{ color: 'white', padding: '20px', textAlign: 'center' }}>
                  Нет данных о предметах
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Рекомендации от ИИ */}
        {aiRecommendations && (
          <div className="ai-recommendations-section">
            <h3>🤖 Рекомендации от ИИ</h3>
            {aiRecommendations.reasoning && (
              <div className="ai-reasoning">
                <p>{aiRecommendations.reasoning}</p>
              </div>
            )}

            {/* Ботинки */}
            {aiRecommendations.recommendations.boots && aiRecommendations.recommendations.boots.length > 0 && (
              <div className="items-phase-section">
                <h4>Ботинки</h4>
                <div className="starting-items-grid">
                  {aiRecommendations.recommendations.boots.map((itemId) => {
                    const item = itemsMap[itemId];
                    if (!item) return null;
                    return (
                      <div key={`ai-boots-${itemId}`} className="starting-item-card">
                        <div className="starting-item-image">
                          <img 
                            src={getItemImageUrl(itemId, item)}
                            alt={item.displayName}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="starting-item-info">
                          <div className="starting-item-name">{item.displayName}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Начальная игра */}
            {aiRecommendations.recommendations.starting && aiRecommendations.recommendations.starting.length > 0 && (
              <div className="items-phase-section">
                <h4>Начальная игра: (-1:40)</h4>
                <div className="starting-items-grid">
                  {aiRecommendations.recommendations.starting.map((itemId) => {
                    const item = itemsMap[itemId];
                    if (!item) return null;
                    return (
                      <div key={`ai-starting-${itemId}`} className="starting-item-card">
                        <div className="starting-item-image">
                          <img 
                            src={getItemImageUrl(itemId, item)}
                            alt={item.displayName}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="starting-item-info">
                          <div className="starting-item-name">{item.displayName}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ранняя игра */}
            {aiRecommendations.recommendations.early && aiRecommendations.recommendations.early.length > 0 && (
              <div className="items-phase-section">
                <h4>Ранняя игра (0:00 - 15:00)</h4>
                <div className="starting-items-grid">
                  {aiRecommendations.recommendations.early.map((itemId) => {
                    const item = itemsMap[itemId];
                    if (!item) return null;
                    return (
                      <div key={`ai-early-${itemId}`} className="starting-item-card">
                        <div className="starting-item-image">
                          <img 
                            src={getItemImageUrl(itemId, item)}
                            alt={item.displayName}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="starting-item-info">
                          <div className="starting-item-name">{item.displayName}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Мидгейм */}
            {aiRecommendations.recommendations.mid && aiRecommendations.recommendations.mid.length > 0 && (
              <div className="items-phase-section">
                <h4>Мидгейм (15:00 - 35:00)</h4>
                <div className="starting-items-grid">
                  {aiRecommendations.recommendations.mid.map((itemId) => {
                    const item = itemsMap[itemId];
                    if (!item) return null;
                    return (
                      <div key={`ai-mid-${itemId}`} className="starting-item-card">
                        <div className="starting-item-image">
                          <img 
                            src={getItemImageUrl(itemId, item)}
                            alt={item.displayName}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="starting-item-info">
                          <div className="starting-item-name">{item.displayName}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Поздняя игра */}
            {aiRecommendations.recommendations.late && aiRecommendations.recommendations.late.length > 0 && (
              <div className="items-phase-section">
                <h4>Поздняя игра (35:00+)</h4>
                <div className="starting-items-grid">
                  {aiRecommendations.recommendations.late.map((itemId) => {
                    const item = itemsMap[itemId];
                    if (!item) return null;
                    return (
                      <div key={`ai-late-${itemId}`} className="starting-item-card">
                        <div className="starting-item-image">
                          <img 
                            src={getItemImageUrl(itemId, item)}
                            alt={item.displayName}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="starting-item-info">
                          <div className="starting-item-name">{item.displayName}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Финальный билд */}
            {aiRecommendations.recommendations.finalBuild && aiRecommendations.recommendations.finalBuild.length > 0 && (
              <div className="items-phase-section final-build-section">
                <h4>Финальный билд (6 предметов)</h4>
                <div className="final-build-grid">
                  {aiRecommendations.recommendations.finalBuild.map((itemId) => {
                    const item = itemsMap[itemId];
                    if (!item) return null;
                    return (
                      <div key={`ai-final-${itemId}`} className="final-build-item-card">
                        <div className="final-build-item-image">
                          <img 
                            src={getItemImageUrl(itemId, item)}
                            alt={item.displayName}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="final-build-item-name">{item.displayName}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        </>
      )}

      {/* Модальное окно выбора героев для ИИ рекомендаций */}
      {isAIModalOpen && (
        <div className="ai-modal-overlay" onClick={() => {
          setIsAIModalOpen(false);
          setMyTeamSearchTerm('');
          setEnemyTeamSearchTerm('');
        }}>
          <div className="ai-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h2>🤖 Выбор героев для рекомендаций ИИ</h2>
              <button 
                className="ai-modal-close" 
                onClick={() => {
                  setIsAIModalOpen(false);
                  setMyTeamSearchTerm('');
                  setEnemyTeamSearchTerm('');
                }}
              >
                ×
              </button>
            </div>

            <div className="ai-modal-body">
              {/* Наша команда */}
              <div className="ai-team-section">
                <h3>Наша команда ({myTeamHeroes.length}/5)</h3>
                
                {/* Выбранные герои */}
                <div className="ai-selected-heroes">
                  {myTeamHeroes.map(hero => {
                    const isSelectedFromRoulette = selectedHero && hero.id === selectedHero.id;
                    return (
                      <div key={hero.id} className="ai-selected-hero-card">
                        <img src={getHeroImageUrl(hero.cdnName)} alt={hero.displayName} />
                        <span>{hero.displayName}</span>
                        {!isSelectedFromRoulette && (
                          <button 
                            className="ai-remove-hero"
                            onClick={() => removeHeroFromMyTeam(hero.id)}
                            title="Удалить"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {Array.from({ length: 5 - myTeamHeroes.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="ai-empty-slot">
                      <span>+</span>
                    </div>
                  ))}
                </div>

                {/* Поиск героев */}
                {myTeamHeroes.length < 5 && (
                  <div className="ai-hero-search">
                    <input
                      type="text"
                      className="ai-search-input"
                      placeholder="Найти героя для нашей команды..."
                      value={myTeamSearchTerm}
                      onChange={(e) => setMyTeamSearchTerm(e.target.value)}
                    />
                    <div className="ai-hero-grid">
                      {filteredMyTeamHeroes.map(hero => (
                        <button
                          key={hero.id}
                          className="ai-hero-card"
                          onClick={() => addHeroToMyTeam(hero)}
                          disabled={myTeamHeroes.length >= 5}
                        >
                          <img src={getHeroImageUrl(hero.cdnName)} alt={hero.displayName} />
                          <span>{hero.displayName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Команда соперника */}
              <div className="ai-team-section">
                <h3>Команда соперника ({enemyTeamHeroes.length}/5)</h3>
                
                {/* Выбранные герои */}
                <div className="ai-selected-heroes">
                  {enemyTeamHeroes.map(hero => (
                    <div key={hero.id} className="ai-selected-hero-card">
                      <img src={getHeroImageUrl(hero.cdnName)} alt={hero.displayName} />
                      <span>{hero.displayName}</span>
                      <button 
                        className="ai-remove-hero"
                        onClick={() => removeHeroFromEnemyTeam(hero.id)}
                        title="Удалить"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {Array.from({ length: 5 - enemyTeamHeroes.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="ai-empty-slot">
                      <span>+</span>
                    </div>
                  ))}
                </div>

                {/* Поиск героев */}
                {enemyTeamHeroes.length < 5 && (
                  <div className="ai-hero-search">
                    <input
                      type="text"
                      className="ai-search-input"
                      placeholder="Найти героя для команды соперника..."
                      value={enemyTeamSearchTerm}
                      onChange={(e) => setEnemyTeamSearchTerm(e.target.value)}
                    />
                    <div className="ai-hero-grid">
                      {filteredEnemyTeamHeroes.map(hero => (
                        <button
                          key={hero.id}
                          className="ai-hero-card"
                          onClick={() => addHeroToEnemyTeam(hero)}
                          disabled={enemyTeamHeroes.length >= 5}
                        >
                          <img src={getHeroImageUrl(hero.cdnName)} alt={hero.displayName} />
                          <span>{hero.displayName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="ai-modal-footer">
              <button 
                className="reset-button"
                onClick={async () => {
                  if (!selectedHero || !heroItems) return;
                  
                  setIsLoadingAIRecommendations(true);
                  setAiRecommendations(null);
                  
                  try {
                    // Подготавливаем данные о предметах для ИИ
                    const availableItems = {
                      boots: heroItems.boots.map(item => ({
                        itemId: item.itemId,
                        displayName: itemsMap[item.itemId]?.displayName || `Item ${item.itemId}`,
                        winsAverage: item.winsAverage,
                        matchCount: item.matchCount,
                      })),
                      starting: heroItems.starting.map(item => ({
                        itemId: item.itemId,
                        displayName: itemsMap[item.itemId]?.displayName || `Item ${item.itemId}`,
                        winsAverage: item.winsAverage,
                        matchCount: item.matchCount,
                      })),
                      early: heroItems.early.map(item => ({
                        itemId: item.itemId,
                        displayName: itemsMap[item.itemId]?.displayName || `Item ${item.itemId}`,
                        winsAverage: item.winsAverage,
                        matchCount: item.matchCount,
                      })),
                      mid: heroItems.mid.map(item => ({
                        itemId: item.itemId,
                        displayName: itemsMap[item.itemId]?.displayName || `Item ${item.itemId}`,
                        winsAverage: item.winsAverage,
                        matchCount: item.matchCount,
                      })),
                      late: heroItems.late.map(item => ({
                        itemId: item.itemId,
                        displayName: itemsMap[item.itemId]?.displayName || `Item ${item.itemId}`,
                        winsAverage: item.winsAverage,
                        matchCount: item.matchCount,
                      })),
                    };

                    const recommendations = await getAIRecommendations(
                      { id: selectedHero.id, displayName: selectedHero.displayName },
                      myTeamHeroes.map(h => ({ id: h.id, displayName: h.displayName })),
                      enemyTeamHeroes.map(h => ({ id: h.id, displayName: h.displayName })),
                      availableItems
                    );

                    if (recommendations) {
                      setAiRecommendations(recommendations);
                      setIsAIModalOpen(false);
                    } else {
                      alert('Не удалось получить рекомендации от ИИ. Проверьте API ключ OpenRouter.');
                    }
                  } catch (error) {
                    console.error('Error getting AI recommendations:', error);
                    alert('Ошибка при получении рекомендаций от ИИ');
                  } finally {
                    setIsLoadingAIRecommendations(false);
                  }
                }}
                disabled={myTeamHeroes.length !== 5 || enemyTeamHeroes.length !== 5 || isLoadingAIRecommendations || !heroItems}
              >
                {isLoadingAIRecommendations ? '⏳ Получение рекомендаций...' : 'Получить рекомендации'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

