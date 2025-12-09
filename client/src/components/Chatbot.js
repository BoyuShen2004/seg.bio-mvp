import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Button, Input, List, Typography, Space, Spin, Popconfirm, Tag, Divider, Card } from 'antd'
import { SendOutlined, CloseOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { queryChatBot, clearChat } from '../utils/api'
import ReactMarkdown from 'react-markdown'

const { TextArea } = Input
const { Text } = Typography
const initialMessage = [{
  id: 1,
  text: "Hi! I'm the seg.bio assistant. Tell me what you want to train, infer, or QC and I'll run the workflow for you.",
  isUser: false
}]

function Chatbot({ onClose }) {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('chatMessages')
    return saved ? JSON.parse(saved) : initialMessage
  })
  const generateThreadId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return `thread-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  }
  const [threadId, setThreadId] = useState(() => {
    const saved = localStorage.getItem('chatThreadId')
    return saved || generateThreadId()
  })
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const lastMessageRef = useRef(null)

  const quickPrompts = useMemo(() => ([
    'Train mitochondria model on my Lucchi++ data for 50 epochs and show ETA.',
    'Run inference with the latest checkpoint on slices 120-180 and send me the viewer link.',
    'Use my last QC corrections to retrain and report expected Dice improvement.',
    'Do a coarse segmentation on the uploaded H5 to check contrast before full training.'
  ]), [])

  const capabilityTags = ['Train', 'Inference', 'QC loop', 'SLURM status', 'Data validation']

  const scrollToLastMessage = () => {
    setTimeout(() => {
      if (lastMessageRef.current) {
        lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 0)
  }

  useEffect(() => {
    localStorage.setItem('chatMessages', JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    if (threadId) {
      localStorage.setItem('chatThreadId', threadId)
    }
  }, [threadId])

  useEffect(() => {
    scrollToLastMessage()
  }, [messages, isSending])

  const pushMessage = (text, isUser = false) => {
    const id = Date.now()
    const next = { id, text, isUser }
    setMessages(prev => [...prev, next])
    return id
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSending) return
    const query = inputValue
    setInputValue('')
    const messageId = pushMessage(query, true)
    setIsSending(true)
    setErrorMessage('')
    try {
      const result = await queryChatBot(query, threadId)
      const updatedThreadId = result?.thread_id || threadId || generateThreadId()
      setThreadId(updatedThreadId)
      const responseText = result?.response
      const botMessage = {
        id: messageId + 1,
        text: responseText || 'Sorry, I could not generate a response.',
        isUser: false
      }
      setMessages(prev => [...prev, botMessage])
    } catch (e) {
      setErrorMessage('Error contacting the agent. Please try again.')
      setMessages(prev => [...prev, { id: prev.length + 1, text: 'Error contacting chatbot.', isUser: false }])
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleClearChat = async () => {
    try {
      await clearChat(threadId)
      const freshThreadId = generateThreadId()
      setThreadId(freshThreadId)
      setMessages(initialMessage)
      localStorage.setItem('chatMessages', JSON.stringify(initialMessage))
      localStorage.setItem('chatThreadId', freshThreadId)
    } catch (e) {
      console.error('Failed to clear chat:', e)
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc'
      }}
    >
      <div
        style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: '#f8fafc'
        }}
      >
        <Space direction="vertical" size={0}>
          <Text strong>AI Assistant</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Session: {threadId.slice(0, 8)}...</Text>
        </Space>
        <Space>
          <Popconfirm
            title="Clear chat history"
            onConfirm={handleClearChat}
            okText="Clear"
            cancelText="Cancel"
          >
            <Button
              type="text"
              icon={<DeleteOutlined />}
              size="small"
            />
          </Popconfirm>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
            size="small"
          />
        </Space>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <Space size={[4, 4]} wrap>
          {capabilityTags.map(tag => (
            <Tag key={tag} color="blue">{tag}</Tag>
          ))}
        </Space>
        <Card
          size="small"
          style={{ marginTop: 8, borderRadius: 10, background: '#f9fbff' }}
          bodyStyle={{ padding: 12 }}
        >
          <Space align="start">
            <ThunderboltOutlined style={{ color: '#fa8c16', marginTop: 2 }} />
            <div>
              <Text strong>Try a quick command</Text>
              <div style={{ marginTop: 6 }}>
                <Space direction="vertical" size={4}>
                  {quickPrompts.map((prompt) => (
                    <Button
                      key={prompt}
                      type="text"
                      size="small"
                      style={{ textAlign: 'left', padding: '4px 0' }}
                      onClick={() => setInputValue(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </Space>
              </div>
            </div>
          </Space>
        </Card>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 16px 8px',
          background: '#f1f5f9',
          borderTop: '1px solid #eef2f7',
          borderBottom: '1px solid #eef2f7'
        }}
      >
        <List
          rowKey={(item) => item.id}
          dataSource={messages}
          renderItem={(message, index) => {
            const isLastMessage = index === messages.length - 1
            return (
              <List.Item
                ref={isLastMessage ? lastMessageRef : null}
                style={{
                  border: 'none',
                  padding: '6px 0',
                  justifyContent: message.isUser ? 'flex-end' : 'flex-start'
                }}
              >
              <div
                style={{
                  maxWidth: '90%',
                  padding: '10px 12px',
                  borderRadius: '14px',
                  backgroundColor: message.isUser ? '#2563eb' : 'white',
                  color: message.isUser ? 'white' : '#0f172a',
                  boxShadow: message.isUser ? 'none' : '0 4px 12px rgba(15,23,42,0.06)',
                  border: message.isUser ? 'none' : '1px solid #e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'

                }}
              >
                {message.isUser ? (
                  <Text style={{ color: 'white' }}>
                    {message.text}
                  </Text>
                ) : (
                  <ReactMarkdown
                    components={{
                      ul: ({ children }) => <ul style={{ paddingLeft: '20px' }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ paddingLeft: '20px' }}>{children}</ol>
                    }}
                  >
                    {message.text}
                  </ReactMarkdown>
                )}
              </div>
            </List.Item>
            )
          }}
        />
        {isSending && (
          <Spin size="small" />
        )}
        {errorMessage && (
          <Text type="danger" style={{ marginTop: 8, display: 'block' }}>{errorMessage}</Text>
        )}
      </div>
      <div style={{ padding: '12px 16px 16px', background: '#f8fafc' }}>
        <Divider style={{ margin: '8px 0' }} />
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            autoSize={{ minRows: 1, maxRows: 3 }}
            style={{ borderRadius: 12 }}
          />
          <Button
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isSending}
            type="primary"
            style={{ borderRadius: 12 }}
          />
        </Space.Compact>
      </div>
    </div>
  )
}

export default Chatbot
