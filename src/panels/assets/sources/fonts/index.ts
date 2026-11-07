import { TextAaIcon } from '@phosphor-icons/react';
import type { AssetSource } from '../../types';
import { FontsSource } from './FontsSource';

const source: AssetSource = { id: 'fonts', label: 'Fonts', icon: TextAaIcon, order: 20, Component: FontsSource };
export default source;
