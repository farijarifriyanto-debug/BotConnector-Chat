import { useColorScheme } from 'react-native'
import { useSettings } from '../store/settings'

export interface Theme {
  dark: boolean
  bg: string; surface: string; surface2: string; surface3: string; ink: string; muted: string; muted2: string
  line: string; lineStrong: string; accent: string; accent2: string; accentStrong: string; accentSoft: string; accentInk: string
  danger: string; dangerSoft: string; free: string; freeBg: string; plan: string; planBg: string; payg: string; paygBg: string
}

// Same palette as the web Chat (styles.css), so the two feel like one product.
export const lightTheme: Theme = {
  dark: false, bg: '#f3f6f4', surface: '#ffffff', surface2: '#f6f9f7', surface3: '#eaf0ec', ink: '#0f1a15', muted: '#5b6963', muted2: '#86938d',
  line: '#e1e8e4', lineStrong: '#cdd8d2', accent: '#0d7f55', accent2: '#12a36b', accentStrong: '#0a6844', accentSoft: '#e4f5ec', accentInk: '#ffffff',
  danger: '#b4443a', dangerSoft: '#fdeceb', free: '#0d7f55', freeBg: '#e4f5ec', plan: '#3552c9', planBg: '#eaeeff', payg: '#a85f08', paygBg: '#fff2dd',
}
export const darkTheme: Theme = {
  dark: true, bg: '#0a0c0e', surface: '#12151a', surface2: '#171b21', surface3: '#1e232b', ink: '#f3f6f4', muted: '#9aa6a0', muted2: '#6f7b75',
  line: '#222830', lineStrong: '#2e3641', accent: '#4fdca0', accent2: '#86efc0', accentStrong: '#86efc0', accentSoft: '#123027', accentInk: '#04140c',
  danger: '#f08c80', dangerSoft: '#3a1f1c', free: '#6fe0ae', freeBg: '#123027', plan: '#a3b4ff', planBg: '#1d2444', payg: '#f2bd6e', paygBg: '#3a2c14',
}

export function useTheme(): Theme {
  const system = useColorScheme(), pref = useSettings(s => s.theme)
  return (pref === 'auto' ? system === 'dark' : pref === 'dark') ? darkTheme : lightTheme
}
