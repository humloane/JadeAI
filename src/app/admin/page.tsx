'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ConfigProvider,
  Tabs,
  Table,
  Input,
  Button,
  Switch,
  InputNumber,
  Form,
  message,
  Tag,
  Space,
  Card,
  Statistic,
  Row,
  Col,
  Popconfirm,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';

interface OrderRow {
  id: string;
  plan: string;
  amountCents: number;
  credits: number;
  status: string;
  createdAt: string;
  userEmail?: string | null;
  userName?: string | null;
}
interface UserRow { id: string; email?: string | null; name?: string | null; authType: string; createdAt: string }
interface PlanRow { id: string; name: string; priceCents: number; credits: number; days?: number | null; description?: string | null; enabled: boolean; sortOrder: number }
interface TemplateRow { id: string; name: string; enabled: boolean; sortOrder: number }
interface SettingRow { key: string; value: unknown }

const STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'default' },
  submitted: { text: '待确认', color: 'orange' },
  paid: { text: '已到账', color: 'green' },
  cancelled: { text: '已取消', color: 'red' },
};

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const stored = localStorage.getItem('jade_admin_token') || '';
    setToken(stored);
    setSavedToken(stored);
  }, []);

  const api = useCallback(
    async (method: string, path: string, body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-admin-token': savedToken },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '请求失败');
      }
      return res.json();
    },
    [savedToken]
  );

  const loadAll = useCallback(async () => {
    if (!savedToken) return;
    setLoading(true);
    try {
      const [o, u, p, t, s] = await Promise.all([
        api('GET', '/api/admin/orders'),
        api('GET', '/api/admin/users'),
        api('GET', '/api/admin/plans'),
        api('GET', '/api/admin/templates'),
        api('GET', '/api/admin/settings'),
      ]);
      setOrders(o.rows || []);
      setUsers(u.rows || []);
      setPlans(p.rows || []);
      setTemplates(t.rows || []);
      const map: Record<string, unknown> = {};
      for (const row of s.rows || []) map[row.key] = row.value;
      setSettings(map);
      form.setFieldsValue(map);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [api, savedToken, form]);

  useEffect(() => {
    if (savedToken) void loadAll();
  }, [savedToken, loadAll]);

  const revenue = useMemo(
    () => orders.filter((o) => o.status === 'paid').reduce((sum, o) => sum + o.amountCents, 0) / 100,
    [orders]
  );

  const saveToken = () => {
    localStorage.setItem('jade_admin_token', token.trim());
    setSavedToken(token.trim());
  };

  const confirmOrder = async (id: string) => {
    try {
      await api('POST', '/api/admin/confirm', { orderId: id, action: 'confirm' });
      message.success('已确认收款');
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const cancelOrder = async (id: string) => {
    try {
      await api('POST', '/api/admin/confirm', { orderId: id, action: 'cancel' });
      message.success('已取消');
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const savePlan = async (row: PlanRow) => {
    try {
      await api('PUT', '/api/admin/plans', row);
      message.success('已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const saveTemplate = async (row: TemplateRow) => {
    try {
      await api('PUT', '/api/admin/templates', row);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const saveSettings = async (values: Record<string, unknown>) => {
    try {
      await api('PUT', '/api/admin/settings', { settings: values });
      message.success('设置已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  if (!savedToken) {
    return (
      <ConfigProvider locale={zhCN}>
        <div style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
          <Card title="管理后台">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.Password
                placeholder="管理口令（ADMIN_TOKEN）"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onPressEnter={saveToken}
              />
              <Button type="primary" block onClick={saveToken}>
                进入
              </Button>
            </Space>
          </Card>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={zhCN}>
      <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="用户数" value={users.length} /></Card></Col>
          <Col span={6}><Card><Statistic title="订单数" value={orders.length} /></Card></Col>
          <Col span={6}><Card><Statistic title="已收款" value={revenue} precision={2} prefix="¥" /></Card></Col>
          <Col span={6}><Card><Statistic title="模板数" value={templates.filter((t) => t.enabled).length} suffix={`/ ${templates.length}`} /></Card></Col>
        </Row>

        <Card
          extra={
            <Space>
              <Button onClick={() => void loadAll()} loading={loading}>刷新</Button>
              <Button onClick={() => { localStorage.removeItem('jade_admin_token'); setSavedToken(''); }}>退出</Button>
            </Space>
          }
        >
          <Tabs
            items={[
              {
                key: 'orders',
                label: '订单',
                children: (
                  <Table
                    rowKey="id"
                    dataSource={orders}
                    pagination={{ pageSize: 20 }}
                    size="small"
                    columns={[
                      { title: '订单号', dataIndex: 'id', width: 110, render: (v: string) => v.slice(0, 8) },
                      { title: '用户', render: (_, r) => `${r.userName || '—'} ${r.userEmail ? `(${r.userEmail})` : ''}` },
                      { title: '套餐', dataIndex: 'plan', width: 90 },
                      { title: '金额', dataIndex: 'amountCents', width: 90, render: (v: number) => `¥${(v / 100).toFixed(2)}` },
                      {
                        title: '状态', dataIndex: 'status', width: 90,
                        render: (v: string) => <Tag color={STATUS[v]?.color}>{STATUS[v]?.text || v}</Tag>,
                      },
                      { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                      {
                        title: '操作', width: 150,
                        render: (_, r) =>
                          r.status === 'paid' ? <Tag color="green">已完成</Tag> : (
                            <Space>
                              <Button size="small" type="primary" onClick={() => void confirmOrder(r.id)}>确认收款</Button>
                              <Popconfirm title="确定取消？" onConfirm={() => void cancelOrder(r.id)}>
                                <Button size="small" danger>取消</Button>
                              </Popconfirm>
                            </Space>
                          ),
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'users',
                label: '用户',
                children: (
                  <Table
                    rowKey="id"
                    dataSource={users}
                    size="small"
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: '邮箱', dataIndex: 'email', render: (v) => v || '—' },
                      { title: '昵称', dataIndex: 'name', render: (v) => v || '—' },
                      { title: '类型', dataIndex: 'authType', width: 110 },
                      { title: '注册时间', dataIndex: 'createdAt', width: 170, render: (v) => new Date(v).toLocaleString('zh-CN') },
                    ]}
                  />
                ),
              },
              {
                key: 'plans',
                label: '套餐价格',
                children: (
                  <Table
                    rowKey="id"
                    dataSource={plans}
                    size="small"
                    pagination={false}
                    columns={[
                      { title: 'ID', dataIndex: 'id', width: 100 },
                      {
                        title: '名称', dataIndex: 'name', width: 140,
                        render: (v, r) => <Input value={v} onChange={(e) => setPlans((p) => p.map((x) => x.id === r.id ? { ...x, name: e.target.value } : x))} />,
                      },
                      {
                        title: '价格(分)', dataIndex: 'priceCents', width: 120,
                        render: (v, r) => <InputNumber value={v} min={0} onChange={(n) => setPlans((p) => p.map((x) => x.id === r.id ? { ...x, priceCents: Number(n || 0) } : x))} />,
                      },
                      {
                        title: '次数', dataIndex: 'credits', width: 100,
                        render: (v, r) => <InputNumber value={v} min={0} onChange={(n) => setPlans((p) => p.map((x) => x.id === r.id ? { ...x, credits: Number(n || 0) } : x))} />,
                      },
                      {
                        title: '有效天数', dataIndex: 'days', width: 110,
                        render: (v, r) => <InputNumber value={v ?? undefined} min={0} placeholder="永久" onChange={(n) => setPlans((p) => p.map((x) => x.id === r.id ? { ...x, days: n == null ? null : Number(n) } : x))} />,
                      },
                      {
                        title: '上架', dataIndex: 'enabled', width: 70,
                        render: (v, r) => <Switch checked={v} onChange={(c) => setPlans((p) => p.map((x) => x.id === r.id ? { ...x, enabled: c } : x))} />,
                      },
                      {
                        title: '操作', width: 90,
                        render: (_, r) => <Button size="small" type="primary" onClick={() => void savePlan(r)}>保存</Button>,
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'templates',
                label: '模板',
                children: (
                  <Table
                    rowKey="id"
                    dataSource={templates}
                    size="small"
                    pagination={{ pageSize: 15 }}
                    columns={[
                      { title: 'ID', dataIndex: 'id', width: 130 },
                      { title: '名称', dataIndex: 'name', width: 160 },
                      {
                        title: '启用', dataIndex: 'enabled', width: 80,
                        render: (v, r) => (
                          <Switch
                            checked={v}
                            onChange={(c) => {
                              const next = { ...r, enabled: c };
                              setTemplates((list) => list.map((x) => (x.id === r.id ? next : x)));
                              void saveTemplate(next);
                            }}
                          />
                        ),
                      },
                      {
                        title: '排序', dataIndex: 'sortOrder', width: 110,
                        render: (v, r) => (
                          <InputNumber
                            value={v}
                            onChange={(n) => {
                              const next = { ...r, sortOrder: Number(n || 0) };
                              setTemplates((list) => list.map((x) => (x.id === r.id ? next : x)));
                              void saveTemplate(next);
                            }}
                          />
                        ),
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'settings',
                label: '站点设置',
                children: (
                  <Form form={form} layout="vertical" onFinish={saveSettings} style={{ maxWidth: 560 }}>
                    <Form.Item label="站点名称" name="site_name"><Input /></Form.Item>
                    <Form.Item label="Logo 路径" name="site_logo"><Input /></Form.Item>
                    <Form.Item label="ICP 备案号" name="icp"><Input placeholder="留空则不显示" /></Form.Item>
                    <Form.Item label="客服微信" name="contact_wechat"><Input /></Form.Item>
                    <Form.Item label="水印文案" name="watermark_text"><Input /></Form.Item>
                    <Form.Item label="免费导出次数" name="free_exports"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                    <Form.Item label="默认模板" name="default_template"><Input /></Form.Item>
                    <Form.Item label="默认语言" name="default_language"><Input /></Form.Item>
                    <Button type="primary" htmlType="submit">保存设置</Button>
                  </Form>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </ConfigProvider>
  );
}
