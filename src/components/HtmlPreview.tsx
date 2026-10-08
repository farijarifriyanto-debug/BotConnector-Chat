import React from 'react'
import { Modal, Pressable, View } from 'react-native'
import { Text } from './Text'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { useT } from '../hooks/useT'
import { useTheme } from '../theme/theme'
import { Icon } from './Icons'

/** Runs model-written HTML in an isolated, cookie-less WebView. It starts at about:blank and may not navigate anywhere else. */
export function HtmlPreview({ html, visible, onClose }: { html: string; visible: boolean; onClose: () => void }) {
  const th = useTheme(), t = useT()
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ color: th.ink, fontSize: 18, fontWeight: '700' }}>{t('previewTitle')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')} testID="preview-close"><Icon name="Close" color={th.ink} /></Pressable>
        </View>
        <WebView testID="html-webview" style={{ flex: 1, backgroundColor: '#fff' }} originWhitelist={['about:*']} source={{ html }} incognito javaScriptEnabled domStorageEnabled={false} allowsLinkPreview={false} setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={r => r.url === 'about:blank' || r.url.startsWith('about:')} />
      </SafeAreaView>
    </Modal>
  )
}
