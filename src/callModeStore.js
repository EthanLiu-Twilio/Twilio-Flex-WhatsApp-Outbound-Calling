// Tiny singleton that shares the dialpad call-mode state between
// WhatsAppDialpadSection (React) and NamePlugin (Flex Actions / CSS).
const callModeStore = {
  mode: 'pstn', // 'pstn' | 'whatsapp'
};

export default callModeStore;
