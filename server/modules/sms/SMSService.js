const axios = require('axios');

class SMSService {
    constructor(db) {
        this.db = db;
        this.provider = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
        this.mockMode = process.env.SMS_MOCK_MODE !== 'false' || this.provider === 'mock';
        this.senderName = process.env.SMS_SENDER_NAME || 'IMMUNICARE';
        this.semaphoreApiKey = process.env.SEMAPHORE_API_KEY || '';
        this.semaphoreUrl = process.env.SEMAPHORE_API_URL || 'https://api.semaphore.co/api/v4/messages';
    }

    async queueMessage({ infantId = null, caregiverId = null, mobileNumber, messageType, messageBody, sentBy = null }) {
        if (!mobileNumber || !messageBody) {
            throw new Error('mobileNumber and messageBody are required for SMS queueing');
        }

        const [rows] = await this.db.execute(`
            INSERT INTO sms_logs (
                infant_id, caregiver_id, mobile_number, message_type, message_body,
                provider, delivery_status, sent_by
            )
            VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)
            RETURNING id
        `, [infantId, caregiverId, mobileNumber, messageType, messageBody, this.provider, sentBy]);

        return rows[0];
    }

    async processQueued(limit = 50) {
        const [messages] = await this.db.execute(`
            SELECT id, mobile_number, message_body
            FROM sms_logs
            WHERE delivery_status = 'QUEUED'
            ORDER BY sent_at ASC
            LIMIT ?
        `, [Number(limit)]);

        const results = [];
        for (const message of messages) {
            results.push(await this.sendQueuedMessage(message));
        }

        return results;
    }

    async sendQueuedMessage(message) {
        try {
            const providerResult = await this.send(message.mobile_number, message.message_body);
            await this.db.execute(`
                UPDATE sms_logs
                SET delivery_status = ?,
                    provider_message_id = ?,
                    failure_reason = NULL
                WHERE id = ?
            `, [providerResult.deliveryStatus, providerResult.providerMessageId || null, message.id]);

            return { id: message.id, success: true, status: providerResult.deliveryStatus };
        } catch (error) {
            await this.db.execute(`
                UPDATE sms_logs
                SET delivery_status = 'FAILED',
                    failure_reason = ?
                WHERE id = ?
            `, [error.message, message.id]);

            return { id: message.id, success: false, error: error.message };
        }
    }

    async send(mobileNumber, messageBody) {
        if (this.mockMode) {
            console.log(`[SMS MOCK] To: ${mobileNumber} | Message: ${messageBody}`);
            return {
                deliveryStatus: 'SENT',
                providerMessageId: `mock-${Date.now()}`
            };
        }

        if (this.provider === 'semaphore') {
            if (!this.semaphoreApiKey) {
                throw new Error('Semaphore API key is not configured');
            }

            const payload = new URLSearchParams({
                apikey: this.semaphoreApiKey,
                number: mobileNumber,
                message: messageBody,
                sendername: this.senderName
            });

            const response = await axios.post(this.semaphoreUrl, payload.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: Number(process.env.SMS_PROVIDER_TIMEOUT_MS || 10000)
            });

            const providerMessageId = Array.isArray(response.data)
                ? response.data[0]?.message_id
                : response.data?.message_id;

            return {
                deliveryStatus: 'SENT',
                providerMessageId: providerMessageId ? String(providerMessageId) : null
            };
        }

        throw new Error(`Unsupported SMS provider: ${this.provider}`);
    }
}

module.exports = SMSService;
