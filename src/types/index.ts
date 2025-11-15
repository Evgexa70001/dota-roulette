export interface Hero {
  id: string;
  name: string;
  displayName: string;
  cdnName: string; // для CDN изображений
}

export interface Item {
  id: string;
  name: string;
  displayName: string;
  cdnName: string;
}

export interface Team {
  radiant: Hero[];
  dire: Hero[];
  myHero: Hero | null;
  myRole: HeroRole | null;
}

export type HeroRole = 'carry' | 'mid' | 'offlane' | 'soft-support' | 'hard-support';

