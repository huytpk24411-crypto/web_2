import { Component, inject } from '@angular/core';
import { FavoriteService } from '../../services/favorite-service';
import { RoomService } from '../../services/room-service';
@Component({
  selector: 'app-customer-favorites-frame',
  standalone: false,
  templateUrl: './customer-favorites.html',
  styleUrls: ['./customer-favorites.css'],
})
export class CustomerFavoritesComponent {
  rooms = inject(RoomService);
  favorites = inject(FavoriteService);
  get saved() {
    return this.rooms.rooms().filter((r) => this.favorites.has(r.id));
  }
}
