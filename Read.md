# 📦 AI Recommendation Engine — รายละเอียดฟีเจอร์ทั้งหมด

---

## 🗂️ ภาพรวมระบบ

ระบบนี้แบ่งออกเป็น 5 ส่วนหลัก:

1. **Auth System** — จัดการ user (สมัคร/login/logout)
2. **Product System** — จัดการสินค้า
3. **Behavior Tracking** — ติดตามพฤติกรรมผู้ใช้
4. **Recommendation Engine** — ระบบแนะนำสินค้า (หัวใจหลัก)
5. **Admin Dashboard** — หน้าจัดการและดู analytics

---

## 1. 🔐 Auth System

### 1.1 Register (สมัครสมาชิก)
**ทำงานยังไง:**
- User กรอก email + password + ชื่อ
- Backend รับข้อมูล → hash password ด้วย bcrypt → บันทึกลง `users` table
- ส่ง JWT token กลับมาให้ frontend เก็บไว้

```
POST /api/auth/register
Body: { name, email, password }
Response: { user, access_token }
```

**ทำไมต้อง hash password?**
เพราะถ้า database รั่ว จะได้ไม่เห็น password จริง

---

### 1.2 Login
**ทำงานยังไง:**
- User กรอก email + password
- Backend หา user จาก email → เปรียบเทียบ password กับที่ hash ไว้
- ถ้าถูก → สร้าง JWT token อายุ 7 วัน → ส่งกลับ
- Frontend เก็บ token ใน localStorage หรือ cookie

```
POST /api/auth/login
Body: { email, password }
Response: { user, access_token }
```

---

### 1.3 Middleware (ตรวจสอบว่า login อยู่ไหม)
**ทำงานยังไง:**
- ทุก API ที่ต้องการ login จะมี middleware ตรวจ token
- Frontend ส่ง token มาใน Header: `Authorization: Bearer <token>`
- Backend decode token → ถ้าถูกต้องก็ผ่าน ถ้าหมดอายุหรือปลอมก็ return 401

```python
# ทุก protected route จะเรียกอันนี้ก่อน
def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(token, SECRET_KEY)
    return payload["user_id"]
```

---

## 2. 🛍️ Product System

### 2.1 Product Catalog (รายการสินค้า)
**โครงสร้างข้อมูลสินค้า:**

```
products table:
- id (uuid)
- name (ชื่อสินค้า)
- description (คำอธิบาย)
- price (ราคา)
- category (หมวดหมู่ เช่น "shoes", "bags")
- tags (array เช่น ["sport", "running", "white"])
- image_url
- stock (จำนวนสินค้า)
- created_at
```

**Tags สำคัญมากสำหรับ Content-based filtering**
เพราะระบบจะใช้ tags เปรียบเทียบว่าสินค้าไหนคล้ายกัน

---

### 2.2 Get Products (ดึงรายการสินค้า)

```
GET /api/products?page=1&limit=20&category=shoes&search=nike
Response: { products: [...], total, page, totalPages }
```

**ทำงานยังไง:**
- รองรับ pagination (ดึงมาทีละ 20 ชิ้น ไม่ต้องดึงทีเดียวทุกชิ้น)
- Filter ตาม category ได้
- Search ตามชื่อสินค้าได้

---

### 2.3 Get Single Product (ดูสินค้าชิ้นเดียว)

```
GET /api/products/:id
Response: { product, similarProducts: [...], frequentlyBoughtTogether: [...] }
```

**ทำงานยังไง:**
- ดึงข้อมูลสินค้า
- พร้อมกัน → เรียก recommendation engine ให้หา "similar products" มาแสดงด้วยเลย
- บันทึก event ว่า user คนนี้ view สินค้านี้ (ใช้ใน tracking)

---

### 2.4 Create/Update/Delete Product (Admin เท่านั้น)

```
POST   /api/admin/products        → สร้างสินค้าใหม่
PUT    /api/admin/products/:id    → แก้ไขสินค้า
DELETE /api/admin/products/:id    → ลบสินค้า
```

---

## 3. 📊 Behavior Tracking System

นี่คือส่วนที่ "เก็บข้อมูล" ว่า user ทำอะไรบ้าง เป็นวัตถุดิบของ recommendation engine

### 3.1 Event Types (ประเภท event ที่เก็บ)

| Event | ความหมาย | น้ำหนัก (weight) |
|-------|-----------|-----------------|
| `view` | user เปิดดูสินค้า | 1 |
| `click` | กดคลิกสินค้า | 2 |
| `add_to_cart` | เพิ่มเข้าตะกร้า | 3 |
| `purchase` | ซื้อสำเร็จ | 5 |
| `search` | พิมพ์ค้นหา | 1 |

**ทำไมต้องมี weight?**
เพราะ "ซื้อสินค้า" บอกว่าชอบมากกว่า "แค่เปิดดู" ระบบจะนับ weight รวมกัน

---

### 3.2 Track Event API

```
POST /api/events
Body: {
  product_id: "abc123",
  event_type: "view",
  metadata: { time_spent: 30 }   // optional เช่น อยู่ในหน้านานแค่ไหน
}
```

**ทำงานยังไง:**
- Frontend เรียก API นี้ทุกครั้งที่ user ทำอะไร (อาจส่งแบบ background ไม่ให้ user รู้สึก)
- Backend บันทึกลง `interactions` table
- Redis เก็บ event ล่าสุดไว้ cache ด้วย (เร็วกว่าดึงจาก DB ทุกครั้ง)

```
interactions table:
- id
- user_id
- product_id
- event_type
- weight
- metadata (JSON)
- created_at
```

---

### 3.3 User Interaction Matrix
**แนวคิด:**
เมื่อเก็บ events ครบแล้ว สามารถสร้างตาราง "user × product" ได้

```
         สินค้า A  สินค้า B  สินค้า C
User 1:     5         3         0
User 2:     0         4         5
User 3:     2         0         4
```

ตารางนี้คือ input ของ Collaborative Filtering

---

## 4. 🤖 Recommendation Engine

หัวใจของโปรเจค มี 3 algorithm ที่ทำงานร่วมกัน

---

### 4.1 Collaborative Filtering

**แนวคิด:** "คนที่ชอบสิ่งเดียวกับคุณ ก็น่าจะชอบสิ่งที่พวกเขาเคยซื้อแต่คุณยังไม่ได้ซื้อ"

**Algorithm ที่ใช้: ALS (Alternating Least Squares)**

```python
from implicit import als

# สร้าง user-item matrix จาก interactions
model = als.AlternatingLeastSquares(factors=50, iterations=20)
model.fit(user_item_matrix)

# แนะนำสินค้าสำหรับ user คนหนึ่ง
recommended_ids, scores = model.recommend(user_id, user_item_matrix[user_id])
```

**ขั้นตอน:**
1. Query interactions ทั้งหมดจาก DB มาสร้าง sparse matrix
2. Train ALS model (ทำทุกคืน เช่น 2 AM via cron job)
3. บันทึก model ที่ train แล้วไว้ใน MLflow
4. เมื่อมี request → โหลด model → คำนวณ → return

**ข้อจำกัด:** Cold Start Problem
ถ้า user ใหม่ยังไม่มี interaction เลย → ยังแนะนำไม่ได้ → ต้องใช้ Content-based แทนก่อน

---

### 4.2 Content-based Filtering

**แนวคิด:** "วิเคราะห์ features ของสินค้าที่คุณเคยซื้อ แล้วหาสินค้าที่ features คล้ายกัน"

**ขั้นตอน:**

**Step 1: สร้าง Product Vector**
แปลง tags ของสินค้าให้เป็นตัวเลข (TF-IDF หรือ Embedding)

```python
from sklearn.feature_extraction.text import TfidfVectorizer

# รวม tags + description ของสินค้า
product_texts = [" ".join(p.tags) + " " + p.description for p in products]

vectorizer = TfidfVectorizer()
product_vectors = vectorizer.fit_transform(product_texts)
# แต่ละสินค้ากลายเป็น vector เช่น [0.3, 0.0, 0.8, 0.1, ...]
```

**Step 2: คำนวณ Cosine Similarity**
```python
from sklearn.metrics.pairwise import cosine_similarity

# หาสินค้าที่คล้ายกับสินค้า id=5
similarities = cosine_similarity(product_vectors[5], product_vectors)
# [0.92, 0.34, 0.78, ...] → เรียงจากมากไปน้อย → top 10 คือ similar products
```

**Step 3: เก็บ Vectors ใน pgvector**
```sql
-- pgvector extension ใน PostgreSQL
CREATE TABLE product_embeddings (
  product_id UUID,
  embedding vector(384)   -- 384 dimensions
);

-- หา similar products ด้วย vector search
SELECT product_id, embedding <=> '[0.3, 0.8, ...]' AS distance
FROM product_embeddings
ORDER BY distance
LIMIT 10;
```

**เมื่อไหร่ที่ vectors ถูก recalculate:**
- เมื่อเพิ่ม/แก้ไขสินค้า → trigger recalculate ทันที
- หรือ batch recalculate ทุกคืน

---

### 4.3 Hybrid Recommendation (ผสมทั้งสองวิธี)

**ทำงานยังไง:**
```python
def get_recommendations(user_id: str, product_id: str = None):
    # 1. ดึง collaborative score
    cf_scores = collaborative_filter(user_id)          # dict: {product_id: score}

    # 2. ดึง content-based score
    cb_scores = content_based_filter(user_id)          # dict: {product_id: score}

    # 3. รวม score แบบ weighted average
    final_scores = {}
    for pid in all_product_ids:
        cf = cf_scores.get(pid, 0)
        cb = cb_scores.get(pid, 0)
        final_scores[pid] = (0.6 * cf) + (0.4 * cb)   # CF หนักกว่า CB

    # 4. เรียงจากมากไปน้อย → return top 10
    return sorted(final_scores, key=lambda x: final_scores[x], reverse=True)[:10]
```

---

### 4.4 LLM Smart Search (Bonus Feature)

**แนวคิด:** แทนที่จะค้นหาแค่ keyword → user พิมพ์ประโยคธรรมชาติได้

ตัวอย่าง:
- "รองเท้าวิ่งสำหรับมือใหม่ราคาไม่เกิน 2000"
- "ของขวัญวันเกิดสำหรับผู้หญิงอายุ 30"

**ทำงานยังไง:**
```python
async def smart_search(query: str):
    # 1. ส่งคำค้นหาให้ LLM แปลงเป็น structured filter
    response = await claude.messages.create(
        model="claude-sonnet-4-20250514",
        messages=[{
            "role": "user",
            "content": f"""
            User searched: "{query}"
            Extract search intent as JSON:
            {{
              "categories": [...],
              "tags": [...],
              "max_price": null or number,
              "keywords": [...]
            }}
            """
        }]
    )

    filters = json.loads(response.content[0].text)

    # 2. ใช้ filters ไป query DB
    products = db.query(Product).filter(
        Product.category.in_(filters["categories"]),
        Product.price <= filters["max_price"]
    ).all()

    return products
```

---

### 4.5 Recommendation API Endpoints

```
GET  /api/recommendations
     → แนะนำ homepage feed สำหรับ user ที่ login อยู่

GET  /api/recommendations/similar/:product_id
     → หาสินค้าที่คล้ายกับสินค้านี้ (ใช้ใน product page)

GET  /api/recommendations/trending
     → สินค้าที่กำลังฮิตในช่วงนี้ (ใช้กับ user ใหม่)

GET  /api/recommendations/bought-together/:product_id
     → "คนที่ซื้อสินค้านี้ มักซื้อสิ่งเหล่านี้ด้วย"

POST /api/search/smart
     Body: { query: "รองเท้าวิ่งสำหรับมือใหม่" }
     → LLM smart search
```

---

### 4.6 Model Training Pipeline (ทำงาน background)

```
ทุกคืน 2 AM:
1. Cron job เรียก training script
2. ดึง interactions ใหม่จาก DB
3. Retrain ALS model
4. Evaluate model (Precision@K, Recall@K)
5. ถ้า metrics ดีกว่าเดิม → บันทึกลง MLflow → set เป็น production model
6. ถ้าแย่ลง → alert และยังใช้ model เดิม
```

---

## 5. 📈 Admin Dashboard

### 5.1 Overview Analytics

```
GET /api/admin/analytics/overview
Response: {
  totalUsers: 1234,
  totalProducts: 456,
  totalOrders: 789,
  revenue: 125000,
  avgOrderValue: 158,
  conversionRate: 3.2    // % ของ user ที่ดูแล้วซื้อ
}
```

---

### 5.2 Recommendation Performance

**Metrics ที่สำคัญ:**

| Metric | ความหมาย | เป้าหมาย |
|--------|-----------|---------|
| CTR (Click-through Rate) | % คนที่กด recommendation | > 5% |
| Conversion Rate | % คนที่ซื้อจาก recommendation | > 1.5% |
| Precision@10 | ใน 10 อันที่แนะนำ ถูกใจกี่อัน | > 30% |
| Coverage | ระบบแนะนำสินค้าได้กี่ % ของทั้งหมด | > 70% |

```
GET /api/admin/analytics/recommendations
Response: {
  ctr: 6.2,
  conversionRate: 2.1,
  precision_at_10: 0.35,
  topRecommendedProducts: [...],
  worstPerformingProducts: [...]
}
```

---

### 5.3 A/B Testing

**แนวคิด:** ทดสอบว่า algorithm ไหนดีกว่ากัน

```
POST /api/admin/experiments
Body: {
  name: "CF vs Hybrid",
  variant_a: { algorithm: "collaborative_filtering" },
  variant_b: { algorithm: "hybrid" },
  traffic_split: 50    // 50% ได้ A, 50% ได้ B
}
```

**ทำงานยังไง:**
- เมื่อ user เข้ามา → random assign เป็น group A หรือ B
- เก็บว่า group ไหน CTR / Conversion rate ดีกว่า
- หลัง 2 สัปดาห์ → ดูผล → เลือก winner

---

### 5.4 User Analytics

```
GET /api/admin/users/:id/behavior
Response: {
  user: { name, email, joinDate },
  totalPurchases: 12,
  favoriteCategories: ["shoes", "bags"],
  recentViews: [...],
  recommendations: [...]    // สินค้าที่ระบบกำลังแนะนำให้เขา
}
```

---

## 6. 🛒 Shopping Features (Frontend)

### 6.1 Personalized Homepage

**ทำงานยังไง:**
```
User เข้าเว็บ
→ Frontend เรียก GET /api/recommendations
→ แสดงผล 3 section:
   1. "แนะนำสำหรับคุณ" (hybrid recommendation)
   2. "กำลังฮิต" (trending products)
   3. "ล่าสุดที่ดูไป" (recent views จาก localStorage)
```

---

### 6.2 Product Page

**ทำงานยังไง:**
```
User เปิดสินค้า
→ Frontend เรียก:
   1. GET /api/products/:id          (ข้อมูลสินค้า)
   2. POST /api/events               (บันทึก "view" event)
   3. GET /api/recommendations/similar/:id   (similar products)
   4. GET /api/recommendations/bought-together/:id
→ แสดง:
   - รายละเอียดสินค้า
   - "สินค้าคล้ายกัน" (4 ชิ้น)
   - "มักซื้อพร้อมกัน" (3 ชิ้น)
```

---

### 6.3 Cart & Checkout

```
POST /api/cart/add
Body: { product_id, quantity }

GET  /api/cart
→ รายการสินค้าในตะกร้า พร้อม recommendation "อาจจะลืม" บางชิ้น

POST /api/orders
Body: { items: [...], payment_method }
→ สร้าง order → บันทึก "purchase" event ให้ทุก product → clear cart
```

---

## 7. 🔧 Technical Details

### 7.1 Caching Strategy (Redis)

**เก็บอะไรใน Redis:**
```
recommendations:{user_id}    → cache recommendations ไว้ 1 ชั่วโมง
similar:{product_id}         → cache similar products ไว้ 6 ชั่วโมง
trending:daily               → cache trending products ไว้ 1 ชั่วโมง
user_session:{token}         → session ของ user
```

**ทำไมต้อง cache?**
เพราะ recommendation เป็น computation หนัก ถ้าคำนวณทุก request จะช้ามาก

---

### 7.2 Background Jobs (Cron)

| Job | เวลา | ทำอะไร |
|-----|------|--------|
| Train CF model | ทุกคืน 2 AM | Retrain ALS ด้วยข้อมูลใหม่ |
| Update embeddings | ทุก 6 ชั่วโมง | Recalculate product vectors |
| Clear old events | ทุกสัปดาห์ | ลบ events เก่ากว่า 90 วัน |
| Analytics summary | ทุกวัน 1 AM | รวบรวม analytics ประจำวัน |

---

### 7.3 Database Schema (ตารางทั้งหมด)

```sql
-- Users
users (id, name, email, password_hash, role, created_at)

-- Products
products (id, name, description, price, category, tags[], image_url, stock)

-- Product vectors (สำหรับ content-based)
product_embeddings (product_id, embedding vector(384))

-- User interactions (หัวใจของ recommendation)
interactions (id, user_id, product_id, event_type, weight, metadata, created_at)

-- Orders
orders (id, user_id, total_price, status, created_at)
order_items (id, order_id, product_id, quantity, price)

-- Recommendations (cache ผลจาก ML model)
recommendations (user_id, product_id, score, algorithm, created_at)

-- A/B Testing
experiments (id, name, variant_a, variant_b, traffic_split, status)
experiment_assignments (user_id, experiment_id, variant, created_at)
```

---

## 8. 🚀 ลำดับการเริ่มเขียน Code

เริ่มแบบนี้จะไม่งง:

```
Week 1: Setup + Auth
├── สร้าง project structure
├── ตั้งค่า PostgreSQL + Redis
├── เขียน User model + migrations
├── POST /auth/register
├── POST /auth/login
└── Middleware ตรวจ JWT

Week 2: Products + Tracking
├── เขียน Product model
├── Seed ข้อมูลสินค้าทดสอบ 100 ชิ้น
├── GET /products (list + filter + search)
├── GET /products/:id
└── POST /events (tracking)

Week 3: Content-based Filtering
├── สร้าง TF-IDF vectors จาก product tags
├── คำนวณ cosine similarity
├── GET /recommendations/similar/:id
└── ทดสอบ accuracy

Week 4: Collaborative Filtering
├── สร้าง user-item matrix
├── Train ALS model
├── GET /recommendations (personalized)
└── MLflow tracking

Week 5: Frontend
├── Next.js setup + Tailwind
├── Homepage (product list + recommendations)
├── Product detail page
└── Cart + Checkout

Week 6: Admin Dashboard
├── Analytics API
├── Dashboard UI (charts)
└── A/B testing setup

Week 7: Deploy
├── Dockerize backend
├── Vercel (frontend) + Railway (backend)
└── GitHub Actions CI/CD

Week 8: Polish
├── LLM smart search
├── Performance optimization
└── README + walkthrough video
```

---

## 9. 📁 Project Structure

```
recommendation-engine/
├── backend/                    (FastAPI)
│   ├── app/
│   │   ├── models/            (SQLAlchemy models)
│   │   │   ├── user.py
│   │   │   ├── product.py
│   │   │   └── interaction.py
│   │   ├── routers/           (API endpoints)
│   │   │   ├── auth.py
│   │   │   ├── products.py
│   │   │   ├── events.py
│   │   │   ├── recommendations.py
│   │   │   └── admin.py
│   │   ├── ml/                (ML models)
│   │   │   ├── collaborative.py
│   │   │   ├── content_based.py
│   │   │   └── hybrid.py
│   │   ├── services/          (Business logic)
│   │   └── main.py
│   ├── migrations/            (Alembic)
│   └── requirements.txt
│
├── frontend/                   (Next.js)
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── products/
│   │   │   ├── page.tsx       (product list)
│   │   │   └── [id]/page.tsx  (product detail)
│   │   ├── admin/
│   │   │   └── dashboard/
│   │   └── page.tsx           (homepage)
│   ├── components/
│   │   ├── ProductCard.tsx
│   │   ├── RecommendationRow.tsx
│   │   └── Charts/
│   └── lib/
│       └── api.ts             (API calls)
│
└── docker-compose.yml
```

---

*เริ่มจาก Week 1 ก่อนเลย → Setup project + Auth → แล้วค่อย build ทีละ feature*
