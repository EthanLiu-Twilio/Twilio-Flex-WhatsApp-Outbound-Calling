import React from 'react';
import { FlexPlugin } from '@twilio/flex-plugin';
import { TaskHelper } from '@twilio/flex-ui';
import WhatsAppDialpadSection from './components/WhatsAppDialpadSection';
import callModeStore from './callModeStore';

const PLUGIN_NAME = 'WhatsappOutboundCalling';

export default class WhatsappOutboundCalling extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  init(flex, manager) {
    // Make Flex treat whatsapp_call tasks as voice tasks so the full
    // call canvas (audio controls, mute, hold, hang-up) is shown.
    // isVoiceTask is hardcoded to 'voice' === taskChannelUniqueName, so
    // we extend it to also cover our custom channel.
    const _isVoiceTask = TaskHelper.isVoiceTask;
    TaskHelper.isVoiceTask = function(task) {
      if (task?.taskChannelUniqueName === 'whatsapp_call') return true;
      return _isVoiceTask.call(this, task);
    };

    // Remove the now-unnecessary TaskChannels.register attempt
    // Inject WhatsApp section into the native outbound dialpad
    flex.OutboundDialerPanel.Content.add(
      <WhatsAppDialpadSection key="whatsapp-dialpad-section" />,
      { sortOrder: -1 }
    );

    // Patch outbound_to with whatsapp: prefix before the task is accepted.
    // Uses Flex ITask.setAttributes() which goes through the Flex backend
    // (unlike the raw TaskRouter.js task object which has no update method).
    flex.Actions.addListener('beforeAcceptTask', async (payload) => {
      // payload.task is a Flex ITask; fall back to store lookup if not present
      let task = payload.task;
      if (!task) {
        const tasksMap = manager.store.getState().flex.worker.tasks;
        const tasksArr = typeof tasksMap.values === 'function'
          ? [...tasksMap.values()]
          : Object.values(tasksMap);
        task = tasksArr.find(t => t.reservationSid === payload.sid);
      }

      if (!task) {
        console.log('[NamePlugin] beforeAcceptTask: task not found for reservation', payload.sid);
        return;
      }

      const attrs = task.attributes;
      console.log('[NamePlugin] beforeAcceptTask attrs:', JSON.stringify(attrs));

      if (attrs.direction === 'outbound' && callModeStore.mode === 'whatsapp') {
        try {
          await task.setAttributes({
            ...attrs,
			from: `whatsapp:${attrs.from}`,
            outbound_to: `whatsapp:${attrs.outbound_to}`,
          });
          console.log('[NamePlugin] beforeAcceptTask: patched outbound_to ->', `whatsapp:${attrs.outbound_to}`);
        } catch (err) {
          console.warn('[NamePlugin] beforeAcceptTask: setAttributes failed:', err);
        }
      }
    });

  }
}