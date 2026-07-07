import React, { useState, useEffect } from 'react';
import { Manager } from '@twilio/flex-ui';
import callModeStore from '../callModeStore';
import { Box } from '@twilio-paste/core/box';
import { Button } from '@twilio-paste/core/button';
import { Separator } from '@twilio-paste/core/separator';
import { Text } from '@twilio-paste/core/text';
import { Theme } from '@twilio-paste/core/theme';
import { Spinner } from '@twilio-paste/core/spinner';

const WHATSAPP_SERVICE_BASE = process.env.FLEX_APP_WHATSAPP_SERVICE_BASE;

const WhatsAppDialpadSection = () => {
  const [dialpadNumber, setDialpadNumber] = useState('');
  const [callMode, setCallMode] = useState(null); // null | 'pstn' | 'whatsapp'
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMsgLoading, setIsMsgLoading] = useState(false);

  // Read the phone number from the native Flex dialpad input.
  // The number lives in the Dialer component's local state (not Redux),
  // so we watch the DOM input directly.
  useEffect(() => {
    const getDialpadValue = () => {
      // The Flex PhoneInput renders with data-testid="phoneinput".
      // It may be a wrapper element, so fall back to the inner <input>.
      // PhoneInput renders a wrapper with a country selector (first input)
      // and the actual number field (input[type="tel"]). Target type="tel"
      // explicitly to avoid reading the country code selector.
      const el = document.querySelector('[data-testid="phoneinput"]');
      const input = (el instanceof HTMLInputElement && el.type === 'tel')
        ? el
        : el?.querySelector('input[type="tel"]');
      return input?.value || '';
    };

    const handler = () => setDialpadNumber(getDialpadValue());

    document.addEventListener('input', handler);

    // Poll once after a short delay in case the panel was already open.
    const timer = setTimeout(handler, 300);

    return () => {
      document.removeEventListener('input', handler);
      clearTimeout(timer);
    };
  }, []);

  // Reset mode every time the dialpad panel mounts (opens).
  useEffect(() => {
    setCallMode(null);
    setStatus('');
    callModeStore.mode = null;
    document.body.classList.remove('whatsapp-mode-active');
  }, []);

  const switchMode = (mode) => {
    setCallMode(mode);
    setStatus('');
    callModeStore.mode = mode;
    document.body.classList.toggle('whatsapp-mode-active', mode === 'whatsapp');
  };

  const cleanNumber = dialpadNumber.replace(/\s/g, '');

  const handleSendMessageTemplate = async () => {
    if (!cleanNumber || isMsgLoading) return;

    setIsMsgLoading(true);
    setStatus('');

    const manager = Manager.getInstance();
    const token = manager.store.getState().flex.session.ssoTokenPayload.token;

    try {
      const response = await fetch(
        `${WHATSAPP_SERVICE_BASE}/send-message-template`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: cleanNumber, Token: token }),
        }
      );

      let data = await response.json();
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) {}
      }

      if (response.ok && (data.success === true || data.success === 'true')) {
        setStatus('Message template sent! Wait for the customer to reply, then send the consent template.');
      } else {
        const errorMsg = data.error || data.message || `Server returned status ${response.status}`;
        setStatus(`Template error: ${errorMsg}`);
      }
    } catch (err) {
      console.error('[WhatsAppDialpadSection] send-message-template error:', err);
      setStatus('Backend communication error.');
    } finally {
      setIsMsgLoading(false);
    }
  };

  const handleSendConsentTemplate = async () => {
    if (!cleanNumber || isLoading) return;

    setIsLoading(true);
    setStatus('');

    const manager = Manager.getInstance();
    const token = manager.store.getState().flex.session.ssoTokenPayload.token;

    try {
      setStatus('Sending consent template…');

      const response = await fetch(
        `${WHATSAPP_SERVICE_BASE}/send-call-template`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: cleanNumber, Token: token }),
        }
      );

      let data = await response.json();
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) {}
      }

      if (response.ok && (data.success === true || data.success === 'true')) {
        setStatus('Template sent! Check the Messaging Log for the result.');
      } else {
        const errorMsg = data.error || data.message || `Server returned status ${response.status}`;
        setStatus(`Template error: ${errorMsg}`);
      }
    } catch (err) {
      console.error('[WhatsAppDialpadSection] fetch error:', err);
      setStatus('Backend communication error.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Theme.Provider theme="dark">
      <Box paddingX="space50" paddingTop="space50" paddingBottom="space60">
        {/* ── Mode selector ── */}
        <Text as="p" fontWeight="fontWeightBold" marginBottom="space30">
          Call Mode
        </Text>
        <Box display="flex" columnGap="space30" marginBottom="space40">
          <Button
            variant={callMode === 'pstn' ? 'primary' : 'secondary'}
            size="small"
            onClick={() => switchMode('pstn')}
          >
            PSTN Call
          </Button>
          <Button
            variant={callMode === 'whatsapp' ? 'primary' : 'secondary'}
            size="small"
            onClick={() => switchMode('whatsapp')}
          >

            WhatsApp Call
          </Button>
        </Box>

        {/* ── WhatsApp options (only when WhatsApp mode is active) ── */}
        {callMode === 'whatsapp' && (
          <>
            <Box marginBottom="space50">
              <Text as="p" fontSize="fontSize20" color="colorTextWeak" marginBottom="space20">
                New user ? Send an initial message to open the conversation window.
              </Text>
              <Button
                variant="primary"
                fullWidth
                disabled={!cleanNumber || isMsgLoading || isLoading}
                onClick={handleSendMessageTemplate}
              >
                {isMsgLoading ? (
                  <Spinner decorative={false} title="Loading" size="sizeIcon20" />
                ) : (
                  'Send Message Template'
                )}
              </Button>
            </Box>

            <Box marginBottom="space50">
              <Text as="p" fontSize="fontSize20" color="colorTextWeak" marginBottom="space20">
                Send a call consent request — customer must reply before you can call.
              </Text>
              <Button
                variant="primary"
                fullWidth
                disabled={!cleanNumber || isLoading || isMsgLoading}
                onClick={handleSendConsentTemplate}
              >
                {isLoading ? (
                  <Spinner decorative={false} title="Loading" size="sizeIcon20" />
                ) : (
                  'Send Consent Template'
                )}
              </Button>
            </Box>



            {status && (
              <Box marginTop="space40">
                <Text
                  as="p"
                  fontSize="fontSize20"
                  color={
                    status.startsWith('Error') ||
                    status.startsWith('Backend') ||
                    status.startsWith('Template error')
                      ? 'colorTextError'
                      : 'colorTextSuccess'
                  }
                >
                  {status}
                </Text>
              </Box>
            )}
</>
        )}

        <Separator orientation="horizontal" verticalSpacing="space40" />
      </Box>
    </Theme.Provider>
  );
};

export default WhatsAppDialpadSection;
