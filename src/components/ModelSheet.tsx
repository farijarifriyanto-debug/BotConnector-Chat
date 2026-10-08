import React from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useT } from '../hooks/useT'
import type { Access, ChatModel } from '../lib/types'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

const GROUPS: { access: Access; key: 'groupAuto' | 'groupFree' | 'groupPlan' | 'groupFamily' | 'groupPayg' | 'groupLocal' }[] = [
  { access: 'auto', key: 'groupAuto' }, { access: 'free', key: 'groupFree' }, { access: 'plan', key: 'groupPlan' }, { access: 'family', key: 'groupFamily' }, { access: 'payg', key: 'groupPayg' }, { access: 'local', key: 'groupLocal' },
]

export function ModelSheet({ visible, models, selected, onSelect, onClose }: { visible: boolean; models: ChatModel[]; selected: string; onSelect: (id: string) => void; onClose: () => void }) {
  const th = useTheme(), t = useT()
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('model')}</Text>
          <Pressable onPress={onClose} accessibilityLabel={t('close')} hitSlop={12} testID="model-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {[...GROUPS.map(g => ({ id: g.access, title: t(g.key), list: models.filter(m => m.access === g.access) })),
            ...[...new Set(models.filter(m => m.access === 'custom').map(m => m.provider ?? ''))].map(pn => ({ id: 'custom:' + pn, title: pn, list: models.filter(m => m.access === 'custom' && (m.provider ?? '') === pn) })),
            ...[...new Set(models.filter(m => m.access === 'laptop').map(m => m.provider ?? ''))].map(pn => ({ id: 'laptop:' + pn, title: `${t('laptop')} · ${pn}`, list: models.filter(m => m.access === 'laptop' && (m.provider ?? '') === pn) }))].map(g => {
            const list = g.list; if (!list.length) return null
            return (
              <View key={g.id} style={{ marginBottom: 14 }}>
                <Text style={{ color: th.muted2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{g.title}</Text>
                {list.map(m => (
                  <Pressable key={m.id} testID={`model-${m.id}`} disabled={!m.available} accessibilityRole="button" accessibilityState={{ selected: m.id === selected, disabled: !m.available }} onPress={() => { onSelect(m.id); onClose() }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, backgroundColor: m.id === selected ? th.accentSoft : th.surface, borderWidth: 1, borderColor: m.id === selected ? th.accent : th.line, marginBottom: 6, opacity: m.available ? 1 : 0.5 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: th.ink, fontSize: 15, fontWeight: '600' }}>{m.name}</Text>
                      <Text style={{ color: th.muted, fontSize: 12, marginTop: 2 }}>{!m.available ? t(m.reason === 'no_payg_balance' ? 'needBalance' : 'notAvailable') : [m.context ? t('ctx', { n: Math.round(m.context / 1000) }) : '', m.vision ? t('vision') : '', m.tools ? t('tools') : '', m.reasoning ? t('reasoning') : ''].filter(Boolean).join(' · ') || ' '}</Text>
                    </View>
                    {m.id === selected && <Icon name="Check" size={18} color={th.accentStrong} />}
                  </Pressable>))}
              </View>)
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}
