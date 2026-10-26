# ============================================
# ODOD PIZZA — сервер на Python + SQLite + Yandex AI
# Запуск:  python server.py
# Открыть: http://localhost:8000
# ============================================

import http.server
import json
import os
import sys
import sqlite3
from datetime import datetime

# --- Новые библиотеки для ИИ ---
import urllib.request
import urllib.error
from dotenv import load_dotenv

# Загружаем переменные окружения из .env
load_dotenv()

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(ROOT, 'ododpizza.db')

# Ключи для Yandex AI
YA_API_KEY = os.getenv("YA_API_KEY")
YA_FOLDER_ID = os.getenv("YA_FOLDER_ID")
YA_AGENT_ID = os.getenv("YA_AGENT_ID")

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.webp': 'image/webp',
    '.ico':  'image/x-icon',
    '.db':   'application/octet-stream'
}


# ============================================
# ИИ ФУНКЦИЯ
# ============================================
def get_ai_reply(user_message):
    if not YA_API_KEY or not YA_FOLDER_ID or not YA_AGENT_ID:
        return None, "Ключи API не найдены в .env"

    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    
    headers = {
        "Authorization": f"Api-Key {YA_API_KEY}",
        "Content-Type": "application/json"
    }

    prompt = f"""
    Ты — вежливый администратор пиццерии ODOD PIZZA. 
    Клиент оставил сообщение: "{user_message}"
    Напиши вежливый, краткий и полезный ответ от лица пиццерии.
    Если нужно, напомни про время работы (10:00-23:00) или телефон +7(999)123-45-67.
    """

    data = {
        "modelUri": f"gpt://{YA_FOLDER_ID}/yandexgpt-lite",
        "completionOptions": {
            "stream": False,
            "temperature": 0.3,
            "maxTokens": "500"
        },
        "messages": [
            {"role": "system", "text": "Ты - полезный ассистент."},
            {"role": "user", "text": prompt}
        ]
    }

    req = urllib.request.Request(
        url, 
        data=json.dumps(data).encode('utf-8'), 
        headers=headers, 
        method='POST'
    )

    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            # Извлекаем текст ответа
            text = result['result']['alternatives'][0]['message']['text']
            return text, None
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"Ошибка ИИ: {error_body}")
        return None, f"Ошибка API: {e.code}"
    except Exception as e:
        print(f"Ошибка ИИ: {str(e)}")
        return None, "Ошибка соединения с ИИ"

# ============================================
# БАЗА ДАННЫХ
# ============================================
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def column_exists(cur, table, column):
    cur.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cur.fetchall()]
    return column in cols

def init_db():
    conn = get_db()
    cur = conn.cursor()

    # ----- users -----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL
        )
    """)

    # ----- menu -----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price INTEGER NOT NULL,
            description TEXT NOT NULL,
            images TEXT NOT NULL,
            badge TEXT,
            available INTEGER NOT NULL DEFAULT 1
        )
    """)

    # ----- orders -----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_login TEXT NOT NULL,
            user_name TEXT NOT NULL,
            items_sum INTEGER NOT NULL,
            discount INTEGER NOT NULL DEFAULT 0,
            delivery INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL,
            promo TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Выполнен',
            created_at TEXT NOT NULL,
            reviewed INTEGER NOT NULL DEFAULT 0
        )
    """)

    # ----- order_items -----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            price INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
    """)

    # ----- reviews -----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            user_login TEXT NOT NULL,
            user_name TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
    """)

    # ----- feedback -----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_login TEXT NOT NULL,
            user_name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            processed INTEGER NOT NULL DEFAULT 0,
            reply TEXT DEFAULT NULL,
            replied_at TEXT DEFAULT NULL,
            reply_read INTEGER NOT NULL DEFAULT 0
        )
    """)

    conn.commit()

    # ===== Стартовый admin =====
    cur.execute("SELECT COUNT(*) as c FROM users WHERE login = 'admin'")
    if cur.fetchone()['c'] == 0:
        cur.execute(
            "INSERT INTO users (login, password, name, role, created_at) VALUES (?, ?, ?, ?, ?)",
            ('admin', 'admin', 'admin', 'admin', now_iso())
        )
        conn.commit()
        print('👤 Создан пользователь admin (пароль: admin)')

    # ===== Стартовое меню =====
    cur.execute("SELECT COUNT(*) as c FROM menu")
    if cur.fetchone()['c'] == 0:
        seed_menu(conn)
        print('🍕 Меню заполнено 18 товарами')

    conn.close()

def now_iso():
    return datetime.now().strftime('%Y-%m-%dT%H:%M:%S')

def seed_menu(conn):
    cur = conn.cursor()
    pizzas = [
        ('Маргарита', 'pizza', 450, 'Томатный соус, моцарелла, свежий базилик', 'margarita.jpg', 'Хит'),
        ('Пепперони', 'pizza', 550, 'Пикантная пепперони, моцарелла, томатный соус', 'pepperoni.jpg', 'Хит'),
        ('Четыре сыра', 'pizza', 620, 'Моцарелла, пармезан, дор-блю, чеддер', 'four-cheese.jpg', None),
        ('Гавайская', 'pizza', 580, 'Курица, ананасы, моцарелла, томатный соус', 'hawaiian.jpg', 'Новинка'),
        ('Мясная', 'pizza', 670, 'Пепперони, ветчина, бекон, моцарелла', 'meat.jpg', None),
        ('Дьябло', 'pizza', 640, 'Острый соус, пепперони, халапеньо, моцарелла', 'diavolo.jpg', 'Острая'),
        ('Вегетарианская', 'pizza', 520, 'Помидоры, перец, грибы, оливки, моцарелла', 'vegetarian.jpg', None),
        ('Карбонара', 'pizza', 610, 'Бекон, лук, сливочный соус, моцарелла, пармезан', 'carbonara.jpg', None),
        ('Пять сыров', 'pizza', 690, 'Моцарелла, пармезан, дор-блю, чеддер, фета', 'five-cheese.jpg', 'Хит'),
    ]
    for p in pizzas:
        cur.execute("INSERT INTO menu (name, category, price, description, images, badge) VALUES (?, ?, ?, ?, ?, ?)", p)

    sets = [
        ('Сет «Классический»', 'set', 1450, 'Маргарита + Пепперони + Четыре сыра', 'margarita.jpg,pepperoni.jpg,four-cheese.jpg', 'Хит'),
        ('Сет «Мясной»', 'set', 1650, 'Пепперони + Мясная + Дьябло', 'pepperoni.jpg,meat.jpg,diavolo.jpg', None),
        ('Сет «Вегетарианский»', 'set', 1390, 'Вегетарианская + Маргарита + Четыре сыра', 'vegetarian.jpg,margarita.jpg,four-cheese.jpg', 'Веган'),
    ]
    for s in sets:
        cur.execute("INSERT INTO menu (name, category, price, description, images, badge) VALUES (?, ?, ?, ?, ?, ?)", s)

    drinks = [
        ('Кока-Кола 0,5 л', 'drink', 150, 'Классический газированный напиток, 0,5 л', 'cola.jpg', None),
        ('Фанта 0,5 л', 'drink', 150, 'Апельсиновый газированный напиток, 0,5 л', 'fanta.jpg', None),
        ('Спрайт 0,5 л', 'drink', 150, 'Освежающий лимон-лайм напиток, 0,5 л', 'sprite.jpg', None),
        ('Апельсиновый сок 0,4 л', 'drink', 180, 'Свежевыжатый сок, 0,4 л', 'juice.jpg', None),
        ('Вода 0,5 л', 'drink', 100, 'Негазированная, 0,5 л', 'water.jpg', None),
        ('Молочный коктейль', 'drink', 220, 'Ванильный, клубничный или шоколадный', 'milkshake.jpg', 'Новинка'),
    ]
    for d in drinks:
        cur.execute("INSERT INTO menu (name, category, price, description, images, badge) VALUES (?, ?, ?, ?, ?, ?)", d)
    conn.commit()

# ============================================
# ВСПОМОГАТЕЛЬНОЕ
# ============================================
def row_to_dict(row): return dict(row) if row else None

def menu_row_to_dict(row):
    d = dict(row)
    if d.get('images'):
        d['images'] = [x.strip() for x in d['images'].split(',') if x.strip()]
    else:
        d['images'] = []
    d['image'] = d['images'][0] if d['images'] else ''
    d['available'] = bool(d.get('available', 1))
    return d

def feedback_row_to_dict(row):
    d = dict(row)
    d['userLogin'] = d['user_login']
    d['userName'] = d['user_name']
    d['createdAt'] = d['created_at']
    d['processed'] = bool(d['processed'])
    d['repliedAt'] = d.get('replied_at')
    d['replyRead'] = bool(d.get('reply_read', 0))
    return d

def order_row_to_dict(cur, row):
    d = dict(row)
    d['itemsSum'] = d['items_sum']
    d['userLogin'] = d['user_login']
    d['userName'] = d['user_name']
    d['createdAt'] = d['created_at']
    d['reviewed'] = bool(d['reviewed'])
    cur.execute("SELECT name, price, quantity FROM order_items WHERE order_id = ?", (d['id'],))
    d['items'] = [dict(i) for i in cur.fetchall()]
    return d

def review_row_to_dict(row):
    d = dict(row)
    d['orderId'] = d['order_id']
    d['userLogin'] = d['user_login']
    d['userName'] = d['user_name']
    d['createdAt'] = d['created_at']
    return d

# ============================================
# ОБРАБОТЧИК
# ============================================
class PizzaHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        if self.path.startswith('/api/'):
            sys.stderr.write("[API] %s - %s\n" % (self.address_string(), format % args))

    def do_GET(self):
        path = self.path.split('?')[0]
        query = {}
        if '?' in self.path:
            for pair in self.path.split('?')[1].split('&'):
                if '=' in pair:
                    k, v = pair.split('=', 1)
                    query[k] = v

        conn = get_db()
        cur = conn.cursor()

        try:
            if path == '/api/menu':
                cur.execute("SELECT * FROM menu WHERE available = 1 ORDER BY id")
                items = [menu_row_to_dict(r) for r in cur.fetchall()]
                return self._json(200, {'ok': True, 'menu': items})

            # --- НОВЫЙ ЭНДПОИНТ ДЛЯ РЕКОМЕНДАЦИЙ ---
            if path == '/api/recommendations':
                user = query.get('user', '')
                if not user:
                    return self._json(400, {'ok': False, 'error': 'Не указан пользователь'})

                # 1. Смотрим, что пользователь уже заказывал
                cur.execute("""
                    SELECT DISTINCT oi.name 
                    FROM order_items oi
                    JOIN orders o ON oi.order_id = o.id
                    WHERE o.user_login = ?
                """, (user,))
                history = [row['name'] for row in cur.fetchall()]

                if not history:
                    return self._json(200, {'ok': True, 'recommendations': []})

                # 2. Ищем похожие пиццы, которые он еще не брал
                # Простая логика: берем пиццы из той же категории, что заказывал, но исключаем заказанные
                placeholders = ','.join('?' * len(history))
                cur.execute(f"""
                    SELECT * FROM menu 
                    WHERE category = 'pizza' 
                    AND name NOT IN ({placeholders})
                    ORDER BY RANDOM() LIMIT 3
                """, history)
                
                recs = [menu_row_to_dict(r) for r in cur.fetchall()]
                return self._json(200, {'ok': True, 'recommendations': recs})

            if path == '/api/orders':
                user = query.get('user', '')
                cur.execute("SELECT * FROM orders WHERE user_login = ? ORDER BY id DESC", (user,))
                orders = [order_row_to_dict(cur, r) for r in cur.fetchall()]
                return self._json(200, {'ok': True, 'orders': orders})

            if path == '/api/orders/all':
                user = query.get('user', '')
                cur.execute("SELECT role FROM users WHERE login = ?", (user,))
                row = cur.fetchone()
                if not row or row['role'] != 'admin':
                    return self._json(403, {'ok': False, 'error': 'Доступ только для админа'})
                cur.execute("SELECT * FROM orders ORDER BY id DESC")
                orders = [order_row_to_dict(cur, r) for r in cur.fetchall()]
                return self._json(200, {'ok': True, 'orders': orders})

            if path == '/api/reviews':
                cur.execute("SELECT * FROM reviews ORDER BY id DESC")
                reviews = [review_row_to_dict(r) for r in cur.fetchall()]
                return self._json(200, {'ok': True, 'reviews': reviews})

            if path == '/api/feedback':
                user = query.get('user', '')
                cur.execute("SELECT * FROM feedback WHERE user_login = ? ORDER BY id DESC", (user,))
                feedback = [feedback_row_to_dict(f) for f in cur.fetchall()]
                return self._json(200, {'ok': True, 'feedback': feedback})

            if path == '/api/feedback/all':
                user = query.get('user', '')
                cur.execute("SELECT role FROM users WHERE login = ?", (user,))
                row = cur.fetchone()
                if not row or row['role'] != 'admin':
                    return self._json(403, {'ok': False, 'error': 'Доступ только для админа'})
                cur.execute("SELECT * FROM feedback ORDER BY id DESC")
                feedback = [feedback_row_to_dict(f) for f in cur.fetchall()]
                return self._json(200, {'ok': True, 'feedback': feedback})

            if path == '/api/feedback/unread':
                user = query.get('user', '')
                cur.execute("SELECT COUNT(*) as c FROM feedback WHERE user_login = ? AND reply IS NOT NULL AND reply_read = 0", (user,))
                count = cur.fetchone()['c']
                return self._json(200, {'ok': True, 'hasUnread': count > 0})

        finally:
            conn.close()

        # ----- Статика -----
        if path == '/':
            path = '/index.html'

        full_path = os.path.abspath(os.path.join(ROOT, path.lstrip('/')))
        if not full_path.startswith(ROOT):
            self.send_error(403, 'Forbidden')
            return
        if not os.path.isfile(full_path):
            self.send_error(404, 'File not found')
            return

        ext = os.path.splitext(full_path)[1].lower()
        mime = MIME.get(ext, 'application/octet-stream')

        try:
            with open(full_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, str(e))

    def do_POST(self):
        path = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8') if length else ''

        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}

        conn = get_db()
        cur = conn.cursor()

        try:
            # --- НОВЫЙ ЭНДПОИНТ ДЛЯ ИИ ---
            if path == '/api/feedback/suggest-reply':
                admin_login = (data.get('admin') or '').strip()
                cur.execute("SELECT role FROM users WHERE login = ?", (admin_login,))
                row = cur.fetchone()
                if not row or row['role'] != 'admin':
                    return self._json(403, {'ok': False, 'error': 'Доступ только для админа'})

                message_text = (data.get('message') or '').strip()
                if not message_text:
                    return self._json(400, {'ok': False, 'error': 'Пустое сообщение'})

                reply_text, error = get_ai_reply(message_text)

                if error:
                    return self._json(500, {'ok': False, 'error': error})

                return self._json(200, {'ok': True, 'reply': reply_text})

            if path == '/api/register':
                login = (data.get('login') or '').strip()
                password = data.get('password') or ''
                name = (data.get('name') or '').strip()

                if not login or not password or not name:
                    return self._json(400, {'ok': False, 'error': 'Заполните все поля'})

                cur.execute("SELECT id FROM users WHERE login = ?", (login,))
                if cur.fetchone():
                    return self._json(400, {'ok': False, 'error': 'Такой логин уже занят'})

                cur.execute("INSERT INTO users (login, password, name, role, created_at) VALUES (?, ?, ?, ?, ?)", (login, password, name, 'user', now_iso()))
                conn.commit()
                return self._json(200, {'ok': True, 'user': {'login': login, 'name': name, 'role': 'user'}})

            if path == '/api/login':
                login = (data.get('login') or '').strip()
                password = data.get('password') or ''

                cur.execute("SELECT login, name, role FROM users WHERE login = ? AND password = ?", (login, password))
                row = cur.fetchone()
                if not row:
                    return self._json(401, {'ok': False, 'error': 'Неверный логин или пароль'})

                return self._json(200, {'ok': True, 'user': {'login': row['login'], 'name': row['name'], 'role': row['role']}})

            if path == '/api/order':
                user_login = (data.get('userLogin') or '').strip()
                items = data.get('items') or []
                total = data.get('total', 0)
                promo = data.get('promo', '')

                if not user_login or not items:
                    return self._json(400, {'ok': False, 'error': 'Не хватает данных'})

                cur.execute("SELECT name FROM users WHERE login = ?", (user_login,))
                user_row = cur.fetchone()
                user_name = user_row['name'] if user_row else user_login

                cur.execute("""
                    INSERT INTO orders (user_login, user_name, items_sum, discount, delivery, total, promo, status, created_at, reviewed)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, (user_login, user_name, data.get('itemsSum', total), data.get('discount', 0), data.get('delivery', 0), total, promo, 'Выполнен', now_iso()))
                
                order_id = cur.lastrowid

                for i in items:
                    cur.execute("INSERT INTO order_items (order_id, name, price, quantity) VALUES (?, ?, ?, ?)", (order_id, i.get('name'), i.get('price', 0), i.get('quantity', 1)))

                conn.commit()
                return self._json(200, {'ok': True, 'orderId': order_id})

            if path == '/api/review':
                order_id = int(data.get('orderId', 0))
                user_login = (data.get('userLogin') or '').strip()
                rating = int(data.get('rating', 0))
                comment = (data.get('comment') or '').strip()

                if not order_id or not user_login or rating < 1 or rating > 5 or not comment:
                    return self._json(400, {'ok': False, 'error': 'Не хватает данных'})

                cur.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
                order = cur.fetchone()
                if not order or order['reviewed']:
                    return self._json(400, {'ok': False, 'error': 'Заказ не найден или отзыв уже оставлен'})

                cur.execute("INSERT INTO reviews (order_id, user_login, user_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)", (order_id, user_login, order['user_name'], rating, comment, now_iso()))
                cur.execute("UPDATE orders SET reviewed = 1 WHERE id = ?", (order_id,))
                conn.commit()
                return self._json(200, {'ok': True})

            if path == '/api/review/delete':
                admin_login = (data.get('admin') or '').strip()
                cur.execute("SELECT role FROM users WHERE login = ?", (admin_login,))
                row = cur.fetchone()
                if not row or row['role'] != 'admin':
                    return self._json(403, {'ok': False, 'error': 'Доступ только для админа'})

                review_id = int(data.get('reviewId', 0))
                cur.execute("SELECT order_id FROM reviews WHERE id = ?", (review_id,))
                review = cur.fetchone()
                if not review:
                    return self._json(404, {'ok': False, 'error': 'Отзыв не найден'})

                cur.execute("DELETE FROM reviews WHERE id = ?", (review_id,))
                cur.execute("UPDATE orders SET reviewed = 0 WHERE id = ?", (review['order_id'],))
                conn.commit()
                return self._json(200, {'ok': True})

            if path == '/api/feedback':
                user_login = (data.get('userLogin') or '').strip()
                user_name = (data.get('userName') or '').strip()
                email = (data.get('email') or '').strip()
                message = (data.get('message') or '').strip()

                if not user_login or not email or not message:
                    return self._json(400, {'ok': False, 'error': 'Заполните все поля'})

                cur.execute("INSERT INTO feedback (user_login, user_name, email, message, created_at, processed) VALUES (?, ?, ?, ?, ?, 0)", (user_login, user_name or user_login, email, message, now_iso()))
                conn.commit()
                return self._json(200, {'ok': True})

            if path == '/api/feedback/reply':
                admin_login = (data.get('admin') or '').strip()
                cur.execute("SELECT role FROM users WHERE login = ?", (admin_login,))
                row = cur.fetchone()
                if not row or row['role'] != 'admin':
                    return self._json(403, {'ok': False, 'error': 'Доступ только для админа'})

                fb_id = int(data.get('fbId', 0))
                reply_text = (data.get('reply') or '').strip()

                if not reply_text:
                    return self._json(400, {'ok': False, 'error': 'Введите текст ответа'})

                cur.execute("UPDATE feedback SET reply = ?, replied_at = ?, processed = 1, reply_read = 0 WHERE id = ?", (reply_text, now_iso(), fb_id))
                conn.commit()
                return self._json(200, {'ok': True})

            if path == '/api/feedback/reply/delete':
                admin_login = (data.get('admin') or '').strip()
                cur.execute("SELECT role FROM users WHERE login = ?", (admin_login,))
                row = cur.fetchone()
                if not row or row['role'] != 'admin':
                    return self._json(403, {'ok': False, 'error': 'Доступ только для админа'})

                fb_id = int(data.get('fbId', 0))
                cur.execute("UPDATE feedback SET reply = NULL, replied_at = NULL, processed = 0, reply_read = 0 WHERE id = ?", (fb_id,))
                conn.commit()
                return self._json(200, {'ok': True})

            if path == '/api/feedback/read':
                user_login = (data.get('userLogin') or '').strip()
                cur.execute("UPDATE feedback SET reply_read = 1 WHERE user_login = ? AND reply IS NOT NULL AND reply_read = 0", (user_login,))
                conn.commit()
                return self._json(200, {'ok': True})

            if path == '/api/feedback/delete':
                admin_login = (data.get('admin') or '').strip()
                cur.execute("SELECT role FROM users WHERE login = ?", (admin_login,))
                row = cur.fetchone()
                if not row or row['role'] != 'admin':
                    return self._json(403, {'ok': False, 'error': 'Доступ только для админа'})

                fb_id = int(data.get('fbId', 0))
                cur.execute("DELETE FROM feedback WHERE id = ?", (fb_id,))
                conn.commit()
                return self._json(200, {'ok': True})

        finally:
            conn.close()

        self._json(404, {'ok': False, 'error': 'Not found'})

    def _json(self, code, data):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(payload)

# ============================================
# ЗАПУСК
# ============================================
if __name__ == '__main__':
    print('\n🍕 ODOD PIZZA — запуск сервера')
    if not os.path.exists(DB_FILE):
        print('📄 Создаём новую базу данных: ododpizza.db')
    init_db()
    print('📊 Таблицы готовы')

    if not YA_API_KEY:
        print('⚠️ ВНИМАНИЕ: .env файл не найден или пуст! ИИ не будет работать.')

    server = http.server.HTTPServer(('0.0.0.0', PORT), PizzaHandler)
    print(f'   🌐 http://localhost:{PORT}')
    print('   🛑 Ctrl + C — остановить\n')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n🛑 Сервер остановлен')
        server.server_close()