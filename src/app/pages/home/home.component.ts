import { interval, merge, switchMap } from 'rxjs';
import {
  TuiInputModule,
  TuiInputNumberModule,
  TuiTextfieldControllerModule,
} from '@taiga-ui/legacy';
import { AsyncPipe, NgForOf, NgIf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  INJECTOR,
  input,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  TuiReorder,
  TuiTable,
  TuiTableFilters,
  TuiTablePagination,
} from '@taiga-ui/addon-table';
import { TuiLet, tuiTakeUntilDestroyed } from '@taiga-ui/cdk';
import {
  TuiButton,
  TuiDialogService,
  TuiDropdown,
  TuiLoader,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiAccordion, TuiChevron, TuiStatus } from '@taiga-ui/kit';
import { Dragon } from '@dg-core/types/models/dragon';
import {
  DRAGON_SERVICE,
  dragonServiceFactory,
} from '@dg-core/di/dragon-service';
import {
  DragonFormComponent,
  DragonFormDialogContext,
} from '@dg-shared/components/dragon-form/dragon-form.component';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { ActionWithDragon } from '@dg-core/types/action-with-dragon.types';
import { AuthService } from '@dg-core/services/auth.service';
import { AccountType } from '@dg-core/types/models/user';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    TuiTableFilters,
    AsyncPipe,
    FormsModule,
    NgForOf,
    NgIf,
    ReactiveFormsModule,
    TuiButton,
    TuiChevron,
    TuiDropdown,
    TuiInputModule,
    TuiInputNumberModule,
    TuiLet,
    TuiLoader,
    TuiReorder,
    TuiTable,
    TuiTablePagination,
    TuiTextfieldControllerModule,
    TuiTextfield,
    TuiAccordion,
    TuiStatus,
    TuiButton,
  ],
  providers: [
    {
      provide: DRAGON_SERVICE,
      useFactory: dragonServiceFactory,
    },
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly dragonService = inject(DRAGON_SERVICE);
  private readonly dialogService = inject(TuiDialogService);
  private readonly injector = inject(INJECTOR);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  private readonly DRAGONS_LIST_REFRESH_INTERVAL_MS = 5000;

  readonly inputData = input<Dragon[] | null>(null);

  readonly filterableColumns = [
    'id',
    'name',
    'cave',
    'age',
    'color',
    'type',
    'character',
    'head',
  ] as const;
  readonly filtersForm = new FormGroup<
    Partial<Record<keyof Dragon, FormControl>>
  >(
    this.filterableColumns.reduce(
      (prev, curr) => ({
        ...prev,
        [curr]: new FormControl(''),
      }),
      {}
    )
  );
  readonly filterFn = (item: object, value: object | null): boolean =>
    !value || item.toString().includes(value.toString());
  readonly isLoading = signal(false);
  readonly page = signal(0);
  readonly totalItems = signal(0);
  readonly data = signal<Dragon[]>([]);
  readonly pageSize = 5;
  readonly dragonColumns = [
    'id',
    'name',
    'coordinates',
    'creationDate',
    'cave',
    'killer',
    'age',
    'color',
    'type',
    'character',
    'head',
  ] as const;
  readonly columns = [...this.dragonColumns, 'actions'] as const;
  readonly columnNames = {
    id: 'ID',
    name: 'Name',
    coordinates: 'Coordinates',
    creationDate: 'Creation Date',
    cave: 'Cave',
    killer: 'Killer',
    age: 'Age',
    color: 'Color',
    type: 'Type',
    character: 'Character',
    head: 'Head',
    owner: 'Owner',
    actions: 'Actions',
  };
  readonly actionWithDragon = ActionWithDragon;

  constructor() {
    effect(
      (onCleanup) => {
        const inputData = this.inputData();
        if (inputData) {
          this.data.set(inputData);
          this.totalItems.set(inputData.length);
          return;
        }

        this.isLoading.set(true);

        const getDragonListSubscription = merge(
          interval(this.DRAGONS_LIST_REFRESH_INTERVAL_MS),
          this.dragonService.refreshDragonList$
        )
          .pipe(
            switchMap(() =>
              this.dragonService.getDragonsList$({
                filters: {}, // TODO: implement real filters and sorting
                pagination: {
                  page: this.page(),
                  pageSize: this.pageSize,
                },
              })
            ),
            tuiTakeUntilDestroyed(this.destroyRef)
          )
          .subscribe((response) => {
            this.data.set(response.data);
            this.totalItems.set(response.total);
            this.isLoading.set(false);
          });

        onCleanup(() => {
          getDragonListSubscription.unsubscribe();
        });
      },
      { allowSignalWrites: true }
    );
  }

  edit(item: Dragon): void {
    this.dialogService
      .open<{ item: Dragon; mode: ActionWithDragon }>(
        new PolymorpheusComponent(DragonFormComponent, this.injector),
        {
          data: {
            item,
            mode: ActionWithDragon.Update,
          } as DragonFormDialogContext,
          dismissible: true,
          label: 'Edit dragon',
        }
      )
      .pipe(tuiTakeUntilDestroyed(this.destroyRef))
      .subscribe({
        complete: () => this.dragonService.refreshDragonList$.next(null),
      });
  }

  remove(item: Dragon): void {
    this.dragonService.removeDragon$(item).subscribe({
      complete: () => this.dragonService.refreshDragonList$.next(null),
    });
  }

  view(item: Dragon): void {
    this.dialogService
      .open<{ item: Dragon; mode: ActionWithDragon }>(
        new PolymorpheusComponent(DragonFormComponent, this.injector),
        {
          data: {
            item,
            mode: ActionWithDragon.Read,
          },
          dismissible: true,
          label: 'View dragon',
        }
      )
      .pipe(tuiTakeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  checkUserCanPerformActionWithDragon(
    action: ActionWithDragon,
    dragon: Dragon
  ): boolean {
    const user = this.authService.currentUser!;
    const isOwnDragon = dragon.owner.username === user.username;

    switch (action) {
      case ActionWithDragon.Update:
        return isOwnDragon;
      case ActionWithDragon.Delete:
        return (
          (user.accountType === AccountType.Admin &&
            dragon.canBeEditedByAdmin) ||
          isOwnDragon
        );
      default:
        return true;
    }
  }
}
