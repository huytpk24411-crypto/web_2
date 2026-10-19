import { Room } from '../models/domain';
import { PROPERTIES } from './properties';
import { ROOM_MEDIA } from './room-media';

// Explicit demo catalog. IDs and prices retained so saved workflows keep their references.
// Property membership is illustrative (owner authorized), ready to replace with MongoDB records.
const CATALOG = [
  { id:'r1', code:'NESTRO-402', number:'402', name:'Duplex The Nestro', propertyId:'p1', price:8400000, area:35, type:'Duplex', featured:true },
  { id:'r2', code:'UNI-202', number:'202', name:'CHDV Duplex The Nestro', propertyId:'p1', price:8200000, area:35, type:'Duplex', featured:true },
  { id:'r3', code:'UNI-203', number:'203', name:'CHDV Duplex The Nestro', propertyId:'p1', price:7900000, area:35, type:'Duplex', featured:true },
  { id:'r4', code:'UNI-204', number:'204', name:'Duplex The Nestro ngay làng đại học', propertyId:'p1', price:7800000, area:35, type:'Duplex', featured:true },
  { id:'r5', code:'UNI-205', number:'205', name:'The Nestro CHDV', propertyId:'p1', price:6900000, area:29, type:'Studio', featured:false },
  { id:'r6', code:'UNI-206', number:'206', name:'CHDV đường số 2 gần làng đại học', propertyId:'p-r6', price:2300000, area:30, type:'Studio', featured:false },
  { id:'r7', code:'UNI-207', number:'207', name:'CHDV ngay KTX khu B', propertyId:'p-r7', price:5700000, area:31, type:'Studio', featured:false },
  { id:'r8', code:'UNI-208', number:'208', name:'Duplex Tô Hiệu', propertyId:'p-r8', price:6200000, area:32, type:'Duplex', featured:false },
  { id:'r9', code:'UNI-209', number:'209', name:'Grand studio Mona Home', propertyId:'p2', price:5000000, area:33, type:'Studio', featured:false },
  { id:'r10', code:'UNI-210', number:'210', name:'Studio Mona Home', propertyId:'p2', price:4500000, area:34, type:'Studio', featured:false },
  { id:'r11', code:'UNI-211', number:'211', name:'Duplex ngay làng đại học', propertyId:'p-r11', price:3700000, area:35, type:'Duplex', featured:false },
  { id:'r12', code:'UNI-212', number:'212', name:'Duplex Đào Sư Tích', propertyId:'p-r12', price:3800000, area:36, type:'Duplex', featured:false },
];
export const SEED_ROOMS: Room[] = CATALOG.map(room => {
  const property=PROPERTIES.find(p=>p.id===room.propertyId)!;
  const status: Room['status'] = room.id === 'r3' ? 'HELD'
    : room.id === 'r4' ? 'RENTED'
    : room.id === 'r5' ? 'MAINTENANCE'
    : 'AVAILABLE';
  const publicationStatus: Room['publicationStatus'] = room.id === 'r7' ? 'HIDDEN'
    : room.id === 'r8' ? 'DRAFT'
    : 'PUBLISHED';
  return {...room,address:property.address,district:property.address.includes('Đông Hòa')?'Đông Hòa':'Dĩ An',
    capacity:3,status,businessStatus:status,publicationStatus,images:ROOM_MEDIA[room.id],hasHistory:room.id==='r1',mediaStatus:'illustrative',
    amenities:['Máy lạnh','Tủ lạnh','Giường nệm','Wifi','Bếp riêng','Giờ giấc tự do'],
    description:'Phòng mẫu theo thiết kế. Giá, diện tích và tiện nghi phục vụ trải nghiệm demo; vị trí và nhóm ảnh là minh họa, chờ dữ liệu xác nhận từ MongoDB.'};
});
