exports.handler = async function(context, event, callback) {
    // 1. Initialize Response object and configure CORS headers
    const response = new Twilio.Response();
    response.appendHeader('Access-Control-Allow-Origin', '*');
    response.appendHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.appendHeader('Content-Type', 'application/json');

    // Handle browser CORS preflight requests
    if (event.request && event.request.method === 'OPTIONS') {
        return callback(null, response);
    }

    // 2. Authentication (Flex Identity Validation)
    const token = event.Token;
    const TokenValidator = require('twilio-flex-token-validator').validator;
    
    if (!token) {
      response.setStatusCode(403);
      response.setBody(JSON.stringify({ success: false, message: "Missing Token" }));
      return callback(null, response);
    }
    
    try {
        const verifiedToken = await TokenValidator(token, context.ACCOUNT_SID, context.AUTH_TOKEN);
        console.log(`Verified agent: ${verifiedToken.identity}`);
    } catch (error) {
        response.setStatusCode(401);
        response.setBody(JSON.stringify({ success: false, message: "Unauthorized Flex Token" }));
        return callback(null, response);
    }

    // 3. Main Business Logic
    const client = context.getTwilioClient();

    try {
        let requestData = { ...event };

        // Parse incoming request payload safely if wrapped inside the event request object
        if (event.request && event.request.body) {
          try {
            const parsedBody =
              typeof event.request.body === 'string'
                ? JSON.parse(event.request.body)
                : event.request.body;

            requestData = {
              ...requestData,
              ...parsedBody
            };
          } catch (e) {
            console.error('Failed to parse request body:', e);
          }
        }

        const rawTo = requestData.to;

        if (!rawTo) {
          response.setStatusCode(400);
          response.setBody(JSON.stringify({
            success: false,
            error: 'Missing required parameter: to'
          }));
          return callback(null, response);
        }

        // Format and clean up target parameters
        const customerNumber = rawTo.startsWith('whatsapp:')
          ? rawTo
          : `whatsapp:${rawTo.trim()}`;

        const FLEX_WHATSAPP_NUMBER = context.WHATSAPP_CALLER_ID;
        const WHATSAPP_TEMPLATE_SID = context.WHATSAPP_TEMPLATE_SID_SENDCALL;

        let conversationSid;
        let createdNewConversation = false;

        try {
          // Step 1: Attempt to create a new Conversation
          const conversation = await client.conversations.v1.conversations.create({
            friendlyName: `Outbound Call Consent to ${customerNumber}`
          });

          conversationSid = conversation.sid;

          // Step 2: Attempt to add the WhatsApp customer as a participant
          await client.conversations.v1
            .conversations(conversationSid)
            .participants
            .create({
              'messagingBinding.address': customerNumber,
              'messagingBinding.proxyAddress': FLEX_WHATSAPP_NUMBER
            });

          createdNewConversation = true;

        } catch (err) {
          console.error('Conversation/participant creation error:', err);

          // Handle Twilio Error 50416: Participant already linked to an existing active conversation
          if (err.code === 50416) {
            const match = err.message.match(/Conversation\s+(CH[a-fA-F0-9]{32})/);

            if (!match) {
              throw new Error(
                `Participant already exists but could not extract Conversation SID. Original error: ${err.message}`
              );
            }

            conversationSid = match[1];
            console.log(`Participant already exists. Reusing existing Conversation: ${conversationSid}`);
          } else {
            throw err;
          }
        }

        if (!conversationSid) {
          throw new Error('No Conversation SID available.');
        }

        // Enforce active state on the matched/created Conversation
        try {
          await client.conversations.v1
            .conversations(conversationSid)
            .update({
              state: 'active'
            });
        } catch (stateErr) {
          console.warn('Could not update Conversation state:', stateErr.message);
        }

        console.log('3. Send or resend the template into the Conversation');
        
        // Step 3: Dispatch the target WhatsApp template notification
        try {
          const message = await client.conversations.v1
          .conversations(conversationSid)
          .messages
          .create({
            author: 'system',
            contentSid: WHATSAPP_TEMPLATE_SID
          });

          response.setStatusCode(200);
          response.setBody(JSON.stringify({
            success: true,
            reusedExistingConversation: !createdNewConversation,
            conversationSid,
            messageSid: message.sid
          }));

          return callback(null, response);

        } catch (stateErr) {
          console.log('final return caught stateErr');
          
          // Twilio Error 37010 handling (Voice Call Permanent Permission Exists)
          if (stateErr.code === 37010) {
            response.setStatusCode(200);
            response.setBody(JSON.stringify({
              success: true,
              reusedExistingConversation: !createdNewConversation,
              conversationSid
            }));
            return callback(null, response);
          } else {
            throw stateErr;
          }
        }

    } catch (error) {
        console.error('Error sending outbound conversation template:', error);

        response.setStatusCode(400);
        response.setBody(JSON.stringify({
          success: false,
          error: error.message,
          code: error.code
        }));

        return callback(null, response);
    }
};