import { Injectable, Injector } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpHeaderResponse, HttpSentEvent, HttpProgressEvent, HttpResponse, HttpUserEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { AuthenticationService } from '../_services/auth.service';
import { catchError, switchMap, filter, take, finalize } from 'rxjs/operators';
import { ICurrentUser } from '../_models/currentUser';


@Injectable()
export class TokenInterceptor implements HttpInterceptor {

    constructor(private authService: AuthenticationService) { }

    isRefreshingToken: boolean = false;
    tokenSubject: BehaviorSubject<string> = new BehaviorSubject<string>(null);

    intercept(request: HttpRequest<any>, next: HttpHandler) : Observable<HttpSentEvent | HttpHeaderResponse | HttpProgressEvent | HttpResponse<any> | HttpUserEvent<any> | any> {

        return next.handle(this.addTokenToRequest(request, this.authService.getAuthToken()))
        .pipe(
            catchError(err => {
                if (err instanceof HttpErrorResponse) {
                    switch ((<HttpErrorResponse>err).status) {
                        case 401: 
                            return this.handle401Error(request, next);
                        case 400:
                            return <any>this.authService.logout();       
                    }
                } else {
                    return throwError(err);
                }
            }));
    }

    private addTokenToRequest(request: HttpRequest<any>, token: string) : HttpRequest<any> {
        return request.clone({ setHeaders: { Authorization: `Bearer ${token}`}});
    }

    private handle401Error(request: HttpRequest<any>, next: HttpHandler) {

        if(!this.isRefreshingToken) {
            this.isRefreshingToken = true;
 
            // Reset here so that the following requests wait until the token
            // comes back from the refreshToken call.
            this.tokenSubject.next(null);
 
            return this.authService.refreshToken()
                .pipe(
                    switchMap((user: ICurrentUser) => { 
                            if(user) {
                                this.tokenSubject.next(user.accessToken);;
                                localStorage.setItem('currentUser', JSON.stringify(user));
                                return next.handle(this.addTokenToRequest(request, user.accessToken));
                            }

                            return <any>this.authService.logout();
                    }),
                    catchError(err => {
                        return <any>this.authService.logout();
                    }),
                    finalize(() => {
                        this.isRefreshingToken = false;
                    })
                );
        } else {
            this.isRefreshingToken = false;
            
            return this.tokenSubject
                .pipe(filter(token => token != null),
                take(1),
                switchMap(token => {
                    return next.handle(this.addTokenToRequest(request, token));
                }));
        }
    }
}